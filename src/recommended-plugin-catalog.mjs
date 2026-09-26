// Only this curated catalog supplies package names to the installer.
export const recommendedPlugins = [
  {
    id: 'omd-intent-assistant', name: '需求理解 · OMD UI 增强版', packageName: 'omd-prompt-optimizer', author: '原作者：啃轮胎的西狐（WestFox-AwA） · OMD 适配：gulagala001',
    upstream: { name: 'dsh-prompt-optimizer', url: 'https://github.com/WestFox-AwA/dsh-prompt-optimizer' },
    description: '保留原话，在发送前梳理本轮需求；支持审查、自动、模型选择与只读查证，界面跟随 OMD。默认不安装，手动安装后默认关闭；不附带 Bash，不替换原有提示词优化。',
    category: '模型能力', url: 'https://github.com/gulagala001/omd-prompt-optimizer',
    githubRelease: 'gulagala001/omd-prompt-optimizer',
    review: { version: '0.1.0', dsh: '0.1.7-rc.2', omd: '0.1.7-rc.2.15', platforms: ['Web'],
      sha256: '8b4513840b5a79c4d984422a5034f5ce0f7d4455aa371275177dce8965803266',
      note: '基于原作 dsh-prompt-optimizer 0.7.4，保留 BSD-3-Clause 许可与署名，非上游官方发行版。隔离 Web 核验安装、原话发送、关闭恢复与界面。桌面端及真实模型效果未作同等实测。' },
  },
  {
    id: 'dsh-market', name: 'dsh-market', packageName: 'dshmarket', author: 'dsh-market',
    description: '在 DSH 内浏览、搜索和安装社区插件与主题，支持分类筛选、更新管理及配置备份。安装后在设置中打开插件市场。',
    category: '插件管理', url: 'https://github.com/dsh-market/dsh-market',
  },
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
    review: { version: '0.27.0', dsh: '0.1.7-rc.2', omd: '0.1.7-rc.2.4', platforms: ['Web'],
      note: '复用上游标题冲突修复；桌面端尚未实测。旧版请更新到核验版本。' },
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
