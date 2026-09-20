// Only this curated catalog supplies package names to the installer.
export const recommendedPlugins = [
  {
    id: 'jevify', name: 'Jevify', packageName: 'dsh-plugin-jevify', author: 'gulagala001',
    description: '让普通模型提供 Jev 风格的 Choice、Score、Noul 判断；支持百炼、DeepSeek 官方和 GOAT，可用官方 Jev SDK 直接调用。安装后在设置中选择渠道与模型。',
    category: '模型能力', url: 'https://github.com/gulagala001/jevify',
    githubRelease: 'gulagala001/jevify',
  },
  {
    id: 'dsh-status-rotator', name: 'dsh-status-rotator', packageName: 'dsh-status-rotator', author: '01Virex',
    description: '把“深度求索中…”替换为轮换文案，支持打字机、彩色渐变、弹幕和主题词库，可在设置中编辑。',
    category: '界面增强', url: 'https://github.com/01Virex/dsh-status-rotator',
  },
  {
    id: 'dsh-blender-plugin', name: 'DSH × Blender', packageName: '@dsh-external/dsh-blender-plugin', author: 'sixtysevenlf',
    description: '让模型直接操控 Blender：查看视口、编辑场景、渲染、批量任务与事务回滚。需要 Blender 及配套连接插件。',
    category: '三维创作', url: 'https://github.com/sixtysevenlf/dsh-blender-plugin',
    manualInstall: '作者当前版本使用开发注入方式接入，尚未提供 DSH 标准插件包安装清单。请按项目说明安装，并配置 Blender 端连接。',
  },
  {
    id: 'dsh-whale-widget', name: '小鲸鱼记账挂件', packageName: 'dsh-whale-widget', author: 'MeteorNOX',
    description: '在 DSH 界面显示 DeepSeek 余额、今日用量与每轮消耗，支持拖拽吸附、自定义角色和互动泡泡。',
    category: '用量管理', url: 'https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget',
  },
];
