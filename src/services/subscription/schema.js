/**
 * 团队公共书签 / 订阅集合 JSON Schema 与示例规范
 */

export const SUBSCRIPTION_SCHEMA_VERSION = '1.0.0';

/**
 * 规范模版示例，可供用户导出或作为发布模板
 */
export const SAMPLE_SUBSCRIPTION_TEMPLATE = {
  $schema: 'https://smart-bookmark.extension/schema/v1.json',
  version: SUBSCRIPTION_SCHEMA_VERSION,
  name: 'DevOps & 基础架构导航',
  description: '研发集群控制台、私有镜像库、监控大屏与团队常用入口',
  updatedAt: Date.now(),
  groups: [
    {
      id: 'grp_devops',
      name: 'DevOps 部署中台',
      order: 1,
      isDefaultCollapsed: false
    }
  ],
  bookmarks: [
    {
      id: 'bm_gitlab',
      name: 'GitLab 代码仓库',
      groupId: 'grp_devops',
      iconKey: 'gitlab',
      tags: ['代码托管', 'CI/CD'],
      order: 1,
      endpoints: [
        { url: 'http://10.20.1.50:8080', type: 'intranet', order: 0, name: '内网专线' },
        { url: 'https://gitlab.example.com', type: 'extranet', order: 1, name: '公网入口' }
      ]
    }
  ]
};
