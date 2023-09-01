import { IconFile, IconPlay, IconRefresh, IconSave, IconWrench } from '@douyinfe/semi-icons';
import { Button, Divider, Layout, Space, Toast } from '@douyinfe/semi-ui';
import { AgentScene, IAgentConf, agentConfSchema } from '@yuants/agent';
import Ajv from 'ajv';
import { Actions, TabNode } from 'flexlayout-react';
import { JSONSchema7 } from 'json-schema';
import { useObservableState } from 'observable-hooks';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BehaviorSubject,
  Subject,
  catchError,
  debounceTime,
  defer,
  filter,
  first,
  firstValueFrom,
  map,
  mergeMap,
  switchMap,
  tap,
} from 'rxjs';
import { terminal$ } from '../../common/create-connection';
import { createPersistBehaviorSubject } from '../../common/utils';
import { layoutModel$, openSingletonComponent } from '../../layout-model';
import { AccountFrameUnit } from '../AccountInfo/AccountFrameUnit';
import { accountFrameSeries$, accountPerformance$ } from '../AccountInfo/model';
import { fs } from '../FileSystem/api';
import Form from '../Form';
import { currentKernel$ } from '../Kernel/model';
import { orders$ } from '../Order/model';
import { recordTable$ } from '../Shell/model';
import { LocalAgentScene } from '../StaticFileServerStorage/LocalAgentScene';
import { clearLogAction$ } from '../Workbench/Program';
import { currentHostConfig$ } from '../Workbench/model';
import { bundleCode } from './utils';

const mapScriptParamsSchemaToAgentConfSchema = (schema: JSONSchema7): JSONSchema7 => ({
  allOf: [
    agentConfSchema,
    {
      type: 'object',
      properties: {
        agent_params: schema,
      },
    },
  ],
});

export const agentConfSchema$ = createPersistBehaviorSubject(
  'agent-conf-schema',
  mapScriptParamsSchemaToAgentConfSchema({}),
);

export const agentConf$ = createPersistBehaviorSubject('agent-conf', {} as IAgentConf);
agentConf$.subscribe((agentConf) => {
  Object.assign(globalThis, { agentConf });
});

const complete$ = new BehaviorSubject<boolean>(true);
export const runAgentAction$ = new Subject<void>();
export const reloadSchemaAction$ = new Subject<void>();

const extractAgentMetaInfoFromFilename = (script_path: string) =>
  defer(async () => {
    if (currentHostConfig$.value === null) {
      const agentCode = await bundleCode(script_path);
      const scene = await LocalAgentScene({ bundled_code: agentCode });
      return scene.agentUnit;
    }
    const terminal = await firstValueFrom(terminal$);
    const agentCode = await bundleCode(script_path);
    const scene = await AgentScene(terminal, { bundled_code: agentCode });
    return scene.agentUnit;
  }).pipe(
    //
    map((agentUnit) => ({
      /** Script 参数 Schema */
      script_params_schema: agentUnit.paramsSchema,
    })),
    catchError((e) => {
      Toast.error(`创建应用原型失败，请检查代码是否有误: ${e}`);
      console.error(e);
      throw e;
    }),
  );

reloadSchemaAction$
  .pipe(
    debounceTime(500),
    mergeMap(() => agentConf$.pipe(first())),
    filter((v): v is Exclude<typeof v, undefined> => !!v),

    map((agentConf) => agentConf.entry!),
    tap({
      next: (script_path) => {
        Toast.info(`正在解析代码参数... ${script_path}`);
      },
    }),
    switchMap((script_path) =>
      extractAgentMetaInfoFromFilename(script_path).pipe(
        //
        catchError(() => []),
      ),
    ),
    tap({
      next: (meta) => {
        Toast.success(`代码参数解析成功`);
        agentConfSchema$.next(mapScriptParamsSchemaToAgentConfSchema(meta.script_params_schema));
      },
    }),
  )
  .subscribe();

runAgentAction$.subscribe(async () => {
  const agentConf = agentConf$.value;
  const agentConfSchema = await firstValueFrom(agentConfSchema$);
  if (!agentConfSchema || !agentConf) {
    return;
  }

  complete$.next(false);
  try {
    const validator = new Ajv({ strictSchema: false });
    const isValid = validator.validate(agentConfSchema, agentConf);
    if (!isValid) {
      Toast.error(`参数校验失败，请检查脚本参数`);
      console.error(validator.errors);
      throw validator.errors?.map((e) => e.message).join();
    }
    if (currentHostConfig$.value === null) {
      const agentCode = await bundleCode(agentConf.entry!);
      const scene = await LocalAgentScene({ ...agentConf, bundled_code: agentCode });
      const accountFrameUnit = new AccountFrameUnit(
        scene.kernel,
        scene.accountInfoUnit,
        scene.accountPerformanceUnit,
      );
      await scene.kernel.start();
      currentKernel$.next(scene.kernel);

      recordTable$.next(scene.agentUnit.record_table);

      orders$.next(scene.historyOrderUnit.historyOrders);
      accountPerformance$.next(scene.accountPerformanceUnit.performance);
      accountFrameSeries$.next(accountFrameUnit.data);
      if (Object.keys(scene.agentUnit.record_table).length > 0) {
        openSingletonComponent('RecordTablePanel', '样本分析');
      }
    } else {
      const terminal = await firstValueFrom(terminal$);
      const agentCode = await bundleCode(agentConf.entry!);
      const scene = await AgentScene(terminal, { ...agentConf, bundled_code: agentCode });
      const accountFrameUnit = new AccountFrameUnit(
        scene.kernel,
        scene.accountInfoUnit,
        scene.accountPerformanceUnit,
      );
      await scene.kernel.start();
      currentKernel$.next(scene.kernel);

      recordTable$.next(scene.agentUnit.record_table);

      orders$.next(scene.historyOrderUnit.historyOrders);
      accountPerformance$.next(scene.accountPerformanceUnit.performance);
      accountFrameSeries$.next(accountFrameUnit.data);
      if (Object.keys(scene.agentUnit.record_table).length > 0) {
        openSingletonComponent('RecordTablePanel', '样本分析');
      }
    }

    openSingletonComponent('OrderListPanel', '订单列表');
    openSingletonComponent('TechnicalChart', '走势图');
    openSingletonComponent('AccountFrameChart', '账户走势图');
    openSingletonComponent('AccountPerformancePanel', '账户性能');

    Toast.success(`运行完毕`);
  } catch (e) {
    Toast.error(`创建实例失败，请检查代码或配置是否有问题: ${e}`);
    console.error(e);
  }
  complete$.next(true);
});

export const AgentConfForm = React.memo((props: { node?: TabNode }) => {
  const agentConf = useObservableState(agentConf$);
  const schema = useObservableState(agentConfSchema$) || {};
  const complete = useObservableState(complete$);
  const { t } = useTranslation();

  useEffect(() => {
    if (props.node) {
      layoutModel$.value.doAction(Actions.renameTab(props.node.getId(), t('AgentConfForm')));
    }
  }, [t]);

  return (
    <Layout style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Layout.Header>
        <Space style={{ width: '100%', flexWrap: 'wrap' }}>
          <Button
            icon={<IconPlay />}
            title="运行代码"
            loading={!complete}
            onClick={() => {
              clearLogAction$.next();
              runAgentAction$.next();
            }}
          >
            运行
          </Button>
          <Button
            icon={<IconRefresh />}
            onClick={() => {
              reloadSchemaAction$.next();
            }}
          >
            刷新表单
          </Button>
          <Button
            icon={<IconFile />}
            title="从文件载入配置"
            onClick={async () => {
              try {
                const filename = prompt('配置文件路径');
                if (filename) {
                  const content = await fs.readFile(filename);
                  const json = JSON.parse(content);
                  agentConf$.next(json);
                  Toast.success(`加载 ${filename} 完成`);
                }
              } catch (e) {
                Toast.error(`加载失败: ${e}`);
              }
            }}
          >
            载入配置
          </Button>
          <Button
            icon={<IconSave />}
            title="保存配置到文件"
            onClick={async () => {
              try {
                if (!agentConf) return;
                if (!agentConf.entry) return;
                const saveFilename = prompt('保存路径');
                if (saveFilename) {
                  const bundled_code = await bundleCode(agentConf.entry);
                  await fs.writeFile(saveFilename, JSON.stringify({ ...agentConf, bundled_code }, null, 2));
                  Toast.success(`保存到 ${saveFilename}`);
                }
              } catch (e) {
                Toast.error(`保存失败: ${e}`);
              }
            }}
          >
            保存配置
          </Button>
          <Button
            icon={<IconWrench />}
            onClick={async () => {
              try {
                if (agentConf) {
                  const agentCode = await bundleCode(agentConf.entry!);
                  const bundleFilename = `${agentConf.entry}.bundle.js`;
                  await fs.writeFile(bundleFilename, agentCode);
                  Toast.success(`构建完成，保存到 ${bundleFilename}`);
                } else {
                  Toast.error(`请先解析模型配置`);
                }
              } catch (e) {
                Toast.error(`保存失败: ${e}`);
              }
            }}
          >
            构建
          </Button>
        </Space>
        <Divider />
      </Layout.Header>
      <Layout.Content style={{ overflow: 'auto' }}>
        <Form
          schema={schema}
          formData={agentConf}
          onChange={(e) => {
            agentConf$.next(e.formData);
          }}
        >
          <div></div>
        </Form>
      </Layout.Content>
    </Layout>
  );
});