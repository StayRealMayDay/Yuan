import { IconRefresh } from '@douyinfe/semi-icons';
import { Space, Switch } from '@douyinfe/semi-ui';
import { IDataRecordTypes, encodePath } from '@yuants/data-model';
import { readDataRecords, useAccountInfo } from '@yuants/protocol';
import EChartsReact from 'echarts-for-react';
import { useMemo, useState } from 'react';
import {
  defer,
  filter,
  firstValueFrom,
  from,
  last,
  map,
  mergeAll,
  pipe,
  repeat,
  retry,
  scan,
  switchMap,
  timer,
  toArray,
} from 'rxjs';
import { Button } from '../Interactive';
import { registerPage } from '../Pages';
import { terminal$ } from '../Terminals';
import { useObservable, useObservableState } from 'observable-hooks';
import { IRiskState } from './model';
import { listWatch } from '@yuants/utils';
import { resolveRiskState } from './resolveRiskState';

type IAccountRiskInfo = IDataRecordTypes['account_risk_info'];

registerPage('AccountRiskInfoRelations', () => {
  const [items, setItems] = useState<IAccountRiskInfo[]>([]);
  const [isShowAddress, setShowAddress] = useState(false);
  //   const [mapGroupIdToGroupSupply, setMapGroupIdToGroupSupply] = useState

  const mapAccountIdGroupIdCurrencyToRiskState = useObservableState(
    useObservable(
      pipe(
        map(([x]) => x.filter((xx) => !xx.disabled)),
        listWatch(
          (x) => x.account_id,
          //
          (riskInfo) =>
            terminal$.pipe(
              filter(function <T>(x: T): x is Exclude<T, null> {
                return !!x;
              }),
              switchMap((terminal) =>
                defer(() => useAccountInfo(terminal, riskInfo.account_id)).pipe(
                  map((x) => ({ x: riskInfo, riskInfoState: resolveRiskState(riskInfo, x) })),
                  retry({ delay: 1000 }),
                  repeat({ delay: () => timer(5000) }),
                ),
              ),
            ),
        ),
        scan(
          (acc, cur) => acc.set(cur.x.account_id + cur.x.currency + cur.x.group_id, cur.riskInfoState),
          new Map<string, IRiskState>(),
        ),
      ),
      [items],
    ),
    new Map<string, IRiskState>(),
  );
  const mapGroupIdToGroupSupply = useMemo(() => {
    const tempMap = new Map<string, number>();
    items
      .filter((item) => !item.disabled)
      .forEach((item) => {
        if (item.account_id === 'gate/16659573/spot/USDT') {
          console.log({
            where: 'here',
            items: item,
            mapAccountIdGroupIdCurrencyToRiskState,
            key: item.account_id + item.currency + item.group_id,
            xx: mapAccountIdGroupIdCurrencyToRiskState.get(''),
            as:
              mapAccountIdGroupIdCurrencyToRiskState.get(item.account_id + item.currency + item.group_id)
                ?.active_supply ?? 0,
            ps:
              mapAccountIdGroupIdCurrencyToRiskState.get(item.account_id + item.currency + item.group_id)
                ?.passive_supply ?? 0,
          });
        }
        if (tempMap.has(item.group_id)) {
          tempMap.set(
            item.group_id,
            tempMap.get(item.group_id)! +
              (mapAccountIdGroupIdCurrencyToRiskState.get(item.account_id + item.currency + item.group_id)
                ?.active_supply ?? 0) +
              (mapAccountIdGroupIdCurrencyToRiskState.get(item.account_id + item.currency + item.group_id)
                ?.passive_supply ?? 0),
          );
        } else {
          tempMap.set(
            item.group_id,
            (mapAccountIdGroupIdCurrencyToRiskState.get(item.account_id + item.currency + item.group_id)
              ?.active_supply ?? 0) +
              (mapAccountIdGroupIdCurrencyToRiskState.get(item.account_id + item.currency + item.group_id)
                ?.passive_supply ?? 0),
          );
        }
      });
    return tempMap;
  }, [items, mapAccountIdGroupIdCurrencyToRiskState]);
  const a = new Map<string, string>();
  a.set('123', '123');
  a.set('1223', '123');

  console.log({
    where: 'here',
    items,
    mapAccountIdGroupIdCurrencyToRiskState,
    mapGroupIdToGroupSupply,
    a: mapAccountIdGroupIdCurrencyToRiskState.get(
      JSON.stringify('gate/16659573/future/USDTUSDTfountain-gate'),
    ),
  });

  const option = useMemo(() => {
    const accountIds = new Set<string>();
    const groupIds = new Set<string>();
    // const mapNetworkAddressToItem = new Map<string, IAccountRiskInfo>();
    items
      .filter((item) => !item.disabled)
      .forEach((item) => {
        accountIds.add(item.account_id);
        groupIds.add(item.group_id);
        //   mapNetworkAddressToItem.set(encodePath('Address', item.network_id, item.address), item);
      });

    return {
      title: {
        text: 'Les Miserables',
        subtext: 'Default layout',
        top: 'bottom',
        left: 'right',
      },
      //   tooltip: {},
      tooltip: {
        trigger: 'item', // 针对节点和边都启用
        formatter: function (params: any) {
          console.log({ value: params.data.value });
          // 判断是否是边
          if (params.dataType === 'edge') {
            return `<br/>active supply: ${
              mapAccountIdGroupIdCurrencyToRiskState.get(params.data.value)?.active_supply ?? ''
            }<br/>passive supply: ${
              mapAccountIdGroupIdCurrencyToRiskState.get(params.data.value)?.passive_supply ?? ''
            }<br/>active demand: ${
              mapAccountIdGroupIdCurrencyToRiskState.get(params.data.value)?.active_demand ?? ''
            }<br/>passive demand: ${
              mapAccountIdGroupIdCurrencyToRiskState.get(params.data.value)?.passive_demand ?? ''
            }`;
          }
          // 节点的默认信息
          return `group supply: ${params.data.value}`;
        },
      },
      //   legend: [
      //     {
      //       // selectedMode: 'single',
      //       data: graph.categories.map(function (a) {
      //         return a.name;
      //       }),
      //     },
      //   ],
      series: [
        {
          //   name: 'Les Miserables',
          type: 'graph',
          layout: 'force',
          data: [
            ...[...accountIds].map((x) => ({ id: encodePath('AccountId', x), name: x, value: 1 })),
            ...[...groupIds].map((x) => ({
              id: encodePath('GroupId', x),
              name: x,
              itemStyle: { color: 'red' },
              value: mapGroupIdToGroupSupply.get(x),
              symbolSize: 20,
            })),
          ],
          links: items.flatMap((x) => [
            {
              source: encodePath('GroupId', x.group_id),
              target: encodePath('AccountId', x.account_id),
              value: x.account_id + x.currency + x.group_id,
            },
          ]),
          //   links: graph.links,
          //   categories: graph.categories,
          roam: true,
          label: {
            position: 'right',
          },
          force: {
            repulsion: 100,
          },
        },
      ],
      //   series: {
      //     type: 'graph',
      //     layout: 'force',
      //     // animation: false,
      //     tooltip: {
      //       trigger: 'item', // 针对节点和边都启用
      //       formatter: function (params: any) {
      //         // 判断是否是边
      //         if (params.dataType === 'edge') {
      //           return `边的信息:<br/>来源: ${params.data.source}<br/>目标: ${params.data.target}<br/>值: ${params.data.value}`;
      //         }
      //         // 节点的默认信息
      //         return `节点: ${params.data.name}`;
      //       },
      //     },
      //     data: [
      //       ...[...accountIds].map((x) => ({ id: encodePath('AccountId', x), name: x, value: 1 })),
      //       ...[...groupIds].map((x) => ({
      //         id: encodePath('GroupId', x),
      //         name: x,
      //         itemStyle: { color: 'red' },
      //         value: 1,
      //         symbolSize: 20,
      //       })),
      //       //   ...(isShowAddress
      //       //     ? [...mapNetworkAddressToItem.entries()].map(([k, v]) => ({
      //       //         id: k,
      //       //         // name: v.,
      //       //         itemStyle: { color: 'green' },
      //       //         value: 1,
      //       //       }))
      //       //     : []),
      //     ],
      //     label: {
      //       position: 'right',
      //     },
      //     force: {
      //       initLayout: 'circular',
      //       //   gravity: 1,
      //       repulsion: 1000,
      //       edgeLength: 10,
      //     },
      //     roam: true,
      //     edges: items.flatMap((x) => [
      //       {
      //         source: encodePath('GroupId', x.group_id),
      //         target: encodePath('AccountId', x.account_id),
      //         value: 123,
      //       },
      //     ]),
      //   },
    };
  }, [items, mapAccountIdGroupIdCurrencyToRiskState, mapGroupIdToGroupSupply]);

  return (
    <Space vertical align="start" style={{ width: '100%' }}>
      <Space>
        <Button
          icon={<IconRefresh />}
          onClick={async () => {
            const terminal = await firstValueFrom(terminal$);
            if (!terminal) return;
            const items = await firstValueFrom(
              from(readDataRecords(terminal, { type: 'account_risk_info' })).pipe(
                mergeAll(),
                map((x) => x.origin),
                toArray(),
              ),
            );
            setItems(items);
          }}
        >
          刷新
        </Button>
        <Switch
          checked={isShowAddress}
          onChange={(e) => {
            setShowAddress(e);
          }}
        />
        显示网络地址
      </Space>
      <EChartsReact option={option} style={{ width: '100%', minHeight: 800 }} />
    </Space>
  );
});
