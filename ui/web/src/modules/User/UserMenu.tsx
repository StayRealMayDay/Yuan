import {
  IconComment,
  IconExit,
  IconGithubLogo,
  IconHelpCircle,
  IconInfoCircle,
  IconMenu,
  IconUndo,
  IconUser,
} from '@douyinfe/semi-icons';
import { Avatar, Button, Dropdown, Modal, Tag, Toast, Typography } from '@douyinfe/semi-ui';
import { useObservableState } from 'observable-hooks';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { authState$, supabase } from '../../common/supabase';
import { initialJson, layoutModelJson$, layoutUpdate$, openSingletonComponent } from '../../layout-model';
import { userLocale, userTimezone } from '../Locale/utils';
import { currentHostConfig$ } from '../Workbench/model';
import { triggerLoginModalAction$ } from './Login';
export const UserMenu = React.memo(() => {
  const authState = useObservableState(authState$);
  const currentHostConfig = useObservableState(currentHostConfig$);
  const isHostMode = !!currentHostConfig;
  const { t } = useTranslation();

  return (
    <Dropdown
      trigger="click"
      clickToHide
      position="bottomLeft"
      render={
        <Dropdown.Menu style={{ width: 300 }}>
          {!authState && (
            <>
              <Dropdown.Item
                icon={<IconUser />}
                onClick={() => {
                  triggerLoginModalAction$.next();
                }}
              >
                {t('Login')}
              </Dropdown.Item>
              <Dropdown.Divider />
            </>
          )}
          <Dropdown.Title>{t('UserMenu.Applications')}</Dropdown.Title>
          <Dropdown.Item
            icon={<IconComment />}
            onClick={() => {
              openSingletonComponent('LUI', t('AI Assistant'));
            }}
          >
            {t('AI Assistant')}
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('ManualTradePanel', '手动交易');
            }}
          >
            手动交易 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('AccountReplay', '账户回放');
            }}
          >
            账户回放 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Title>设置</Dropdown.Title>
          <Dropdown.Item
            icon={<IconUndo />}
            onClick={() => {
              layoutModelJson$.next(initialJson);
              layoutUpdate$.next();
            }}
          >
            重置布局
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Title>数据管理</Dropdown.Title>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('TerminalList', '终端列表', 'border_left');
            }}
          >
            终端列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('AccountList', '账户列表', 'border_left');
            }}
          >
            账户列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('ProductList', '品种列表');
            }}
          >
            品种列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('PullSourceRelationList', '同步关系列表');
            }}
          >
            同步关系列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('GeneralSpecificRelationList', '标准品种关系列表');
            }}
          >
            标准品种关系列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('TradeCopyRelationList', '跟单关系列表');
            }}
          >
            跟单关系列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Item
            disabled={!isHostMode}
            onClick={() => {
              openSingletonComponent('SubscriptionRelationList', '订阅关系列表');
            }}
          >
            订阅关系列表 <Tag>主机模式可用</Tag>
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Title>关于</Dropdown.Title>
          <Dropdown.Item
            icon={<IconHelpCircle />}
            onClick={() => {
              open('https://tradelife.feishu.cn/wiki/wikcngXV0voYLV2ihtdNyU2i96g');
            }}
          >
            用户手册
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconInfoCircle />}
            onClick={() => {
              Modal.info({
                title: '关于',
                content: (
                  <Typography.Paragraph>
                    <Typography.Paragraph>GIT HASH: {__COMMIT_HASH__}</Typography.Paragraph>
                    <Typography.Paragraph>时区: {userTimezone}</Typography.Paragraph>
                    <Typography.Paragraph>语言: {userLocale}</Typography.Paragraph>
                  </Typography.Paragraph>
                ),
                hasCancel: false,
              });
            }}
          >
            关于
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconGithubLogo />}
            onClick={() => {
              open('https://github.com/No-Trade-No-Life/Yuan');
            }}
          >
            开源项目
          </Dropdown.Item>
          {authState && (
            <>
              <Dropdown.Divider />
              <Dropdown.Item
                icon={<IconExit />}
                onClick={async () => {
                  const { error } = await supabase.auth.signOut();
                  if (error) {
                    Toast.error(`登出失败: ${error.message}`);
                  }
                }}
              >
                退出登录
              </Dropdown.Item>
            </>
          )}
        </Dropdown.Menu>
      }
    >
      {authState ? (
        <Avatar
          alt={authState.user.email}
          src={authState.user.user_metadata['avatar_url']}
          size="small"
          style={{ margin: 4 }}
        >
          {authState.user.email![0].toUpperCase()}
        </Avatar>
      ) : (
        <Button icon={<IconMenu />}></Button>
      )}
    </Dropdown>
  );
});