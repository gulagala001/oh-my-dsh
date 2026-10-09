// Only this curated catalog supplies package names to the installer.
export const recommendedPlugins = [
  {
    id: 'dsh-intelligent-ui', name: '智能交互回答 · Intelligent UI', packageName: 'dsh-intelligent-ui', author: 'gulagala001',
    description: '在回答内操作清单、计算器、图表、表单、模拟和小游戏；提供独立智能聊天入口和按需技能，沿用 DSH 原生模型与会话。默认不安装。',
    unavailable: 'Intelligent UI 尚未正式发布，公开安装与更新暂未开放。本地验收可安装对应宿主的已校验安装包；已有安装仍可卸载。',
    category: '界面增强', url: 'https://github.com/gulagala001/dsh-intelligent-ui', githubRelease: 'gulagala001/dsh-intelligent-ui',
    // SDK-aligned archives are frozen for local acceptance. The unpublished
    // restriction above keeps public downloads closed until release approval.
    hostBuilds: {
      '0.2.0-rc.2': { version: '0.2.0-rc.2.iui.1.0.0', releaseTag: 'v0.2.0-rc.2.iui.1.0.0', asset: 'dsh-intelligent-ui-0.2.0-rc.2.iui.1.0.0.tgz', sha256: '2df1f901834feb9c437191ad1ddf92f1809862bbb70033123b6dd181e0ab1282', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.11.0', platforms: ['Mac（隔离 Web 宿主）'], allowPrerelease: true,
        note: '成品未正式发布。对应 SDK 的固定安装包已核验安装、启停、重启、取消恢复、卸载及 OMD 共存；保留用户状态。Windows/Linux CI 另有记录，原生桌面 App 未实测。' },
      '0.2.1-alpha.1': { version: '0.2.1-alpha.1.iui.1.0.0', releaseTag: 'v0.2.1-alpha.1.iui.1.0.0', asset: 'dsh-intelligent-ui-0.2.1-alpha.1.iui.1.0.0.tgz', sha256: 'eed166b70b2bf41010a1b3abab9dce4cce5028437aecb6ae2ca44bc5d04056c8', dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.11.0', platforms: ['Mac（隔离 Web 宿主）'], allowPrerelease: true,
        note: '成品未正式发布。对应 SDK 的固定安装包已核验安装、启停、重启、取消恢复、卸载及 OMD 共存；保留用户状态。真实模型验收覆盖五类交互，生成效果依赖所选模型；原生桌面 App 未实测。' },
    },
  },
  {
    "id": "dsh-plugin-subscriptions",
    "name": "订阅登录 · Subscriptions",
    "packageName": "dsh-plugin-subscriptions",
    "author": "原作者：V1ki · OMD 适配：gulagala001",
    "description": "直接登录 ChatGPT、Claude、Grok、Copilot 或 Antigravity 订阅，自动发现模型；支持 ChatGPT Fast、订阅额度及生图。",
    "category": "模型能力",
    "url": "https://github.com/V1ki/dsh-plugin-subscriptions",
    githubRelease: 'gulagala001/dsh-plugin-subscriptions',
    review: { version: '0.9.8-omd.1', upstreamVersion: '0.9.8', releaseTag: 'v0.9.8-omd.1', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.9.0', combinations: [{ dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.9.0' }, { dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.9.0' }], platforms: ['Mac（隔离 Web 宿主）'],
      provenance: { repository: 'gulagala001/dsh-plugin-subscriptions', commit: 'fac507e40af60246e5e364f07d41960b193f02e9' },
      sha256: 'a80b5fec117acc65f23f7f7d991050797621c621f76fbc577252b3389b2533cd',
      note: '固定 OMD 适配发行包，源码 fac507e；保留 V1ki 的 MIT 版权与上游来源，非上游 npm 正式发行。两宿主已在 Mac 隔离 Web 核验原生安装、启停、重启、卸载及 OMD 共存。真实账号 Fast 点击、provider 优先级、付费请求及订阅额度未验收；Windows/Linux 原生桌面未实测。' },
  },
  {
    id: 'dsh-turn-rewind', name: '回合回滚 · Turn Rewind', packageName: '@anionex/dsh-turn-rewind', author: 'Anionex · dsh-external',
    description: '查看回合变更并恢复工作区；恢复前展示计划、保留救援副本并核验结果。',
    unavailable: '固定版本 0.3.9 尚不兼容 DSH 0.2.1-alpha.1，暂不提供安装或更新。已有安装可卸载；等待上游适配。',
    unavailableHosts: ['0.2.1-alpha.1'],
    category: '开发工具', url: 'https://github.com/Anionex/dsh-turn-rewind',
    review: { version: '0.3.9', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.5.0', platforms: ['Mac（隔离 Web 宿主）'],
      source: { repository: 'Anionex/dsh-turn-rewind', commit: '9610ab93c87e2405e7512d53a099b8fb2caf6936' },
      sha256: 'f4ca526ccf81d499546276cebeceb8e2cf0b9f3393bae68751c7440848ab16f2',
      note: '固定源码快照，保留 BSD-3-Clause 许可。已在 Mac 隔离 Web 宿主核验安装、启用、卸载及临时工作区恢复。上游声明 Web；正式桌面 App 界面及 Windows 未同等实测。源码快照仅手动更新。' },
  },
  {
    id: 'dsh-open-design', name: 'OpenDesign · DSH 技能桥接', packageName: 'dsh-open-design', author: 'omegapaopao · 技能来源：nexu-io/open-design 及各技能作者',
    description: '将 52 个设计技能、模板和设计系统接入 DSH 原生技能工具，入口为 open-design。默认不安装；部分技能包含网络或浏览器流程，按宿主权限与实际授权使用。',
    category: '设计创作', url: 'https://github.com/omegapaopao/dsh-open-design',
    githubRelease: 'gulagala001/oh-my-dsh',
    review: { version: '0.1.0-omd.1.0.0', releaseTag: 'opendesign-v0.1.0-omd.1.0.0', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.4.0', platforms: ['Mac'],
      sha256: '6f9f1e87b524fa412c64d890c1be55a48a94d7f0dd0ec96f82e804fec75645cc',
      note: '固定上游 a9d4f4c 的 OMD 适配包，非上游官方发行。52技能、同名项目优先、原生安装启停卸载和checker已在隔离Mac验证；保留许可与来源。真实模型设计、联网技能和Windows尚未验收。发行包锁定此桥接版本，不跟随OMD主插件tag更新。' },
  },
  {
    id: 'omd-intent-assistant', name: '需求理解 · OMD UI 增强版', packageName: 'omd-prompt-optimizer', author: '原作者：啃轮胎的西狐（WestFox-AwA） · OMD 适配：gulagala001',
    upstream: { name: 'dsh-prompt-optimizer', url: 'https://github.com/WestFox-AwA/dsh-prompt-optimizer' },
    description: '保留原话，在发送前梳理本轮需求；支持审查、自动、模型选择与只读查证，界面跟随 OMD。默认不安装，手动安装后默认关闭；不附带 Bash，不替换原有提示词优化。',
    category: '模型能力', url: 'https://github.com/gulagala001/omd-prompt-optimizer',
    githubRelease: 'gulagala001/omd-prompt-optimizer',
    review: { version: '0.3.0', releaseTag: 'v0.3.0', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.9.0', combinations: [{ dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.9.0' }, { dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.9.0' }], platforms: ['Mac（隔离 Web 宿主）'],
      provenance: { repository: 'gulagala001/omd-prompt-optimizer', commit: '9237848d68930eb8c477c299a1358596cb96d3dd' },
      sha256: '8b9eb882ddd57c4098b874628663615858c4a987f49fd6927235d7bd1afdeadf',
      note: '固定源码 9237848 的 OMD 适配发行包，基于原作 dsh-prompt-optimizer 0.7.4，保留 BSD-3-Clause 许可与署名，非上游官方发行版。两宿主已在 Mac 隔离 Web 核验原生安装、启停、卸载、原话发送、关闭恢复及 OMD 共存。真实模型效果及 Windows/Linux 原生桌面未同等实测。' },
  },
  {
    id: 'dsh-market', name: 'dsh-market', packageName: 'dshmarket', author: 'dsh-market',
    description: '在 DSH 内浏览、搜索和安装社区插件与主题，支持分类筛选、更新管理及配置备份。安装后在设置中打开插件市场。',
    category: '插件管理', url: 'https://github.com/dsh-market/dsh-market',
    review: { version: '1.66.14', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0', combinations: [{ dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0' }, { dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.12.0' }], platforms: ['Mac（隔离 Web 宿主）'],
      sha256: '598b1e94be1278f93cd0b344612b701b4de7e04e8c4ffce05fec25ea62828279',
      note: '固定 npm 发行包；两宿主原生安装、OMD 两种加载顺序、设置贡献、启停、重启及卸载已核验。实际市场联网下载、配置备份恢复和原生桌面未作完整业务验收。' },
  },
  {
    id: 'dsh-infinite-gen-4', name: '无限四代', packageName: 'dsh-infinite-gen-4', author: 'Minglink',
    description: '用于提示词对抗研究和回复状态展示。默认不安装；启用后向所有会话注入两段内容生成提示词，会影响 OMD 的实际执行约定，建议仅在独立测试 profile 使用。',
    category: '红队研究', url: 'https://github.com/Minglink/dsh-infinite-gen-4',
    review: { version: '0.4.0', dsh: '0.1.7-rc.2', omd: '0.1.7-rc.2.19', platforms: ['Web'],
      source: { repository: 'Minglink/dsh-infinite-gen-4', commit: '5e377394fe9d6aeab6380e2a5a5f959bc1384426' },
      sha256: '9e6d66001eb06fc790d6eae91d191175b53503521b7f4db8c92a061a111752b1',
      note: '固定四代源码快照，0.4.0 为源码标注版本，非正式发行包；旧标签指向三代，仓库当前主线为五代。2026-10-09 已逐文件核对更名后的官方归档与固定 Git tree，并直接以原归档在 rc.2/alpha.1 原生宿主核验安装、工具声明、启停、重启与卸载；不跟随五代。保留上游提示词与 MIT 许可；不宣称真实模型研究效果，桌面及 Windows 未实测。' },
  },
  {
    id: 'dsh-status-rotator', name: 'dsh-status-rotator', packageName: 'dsh-status-rotator', author: '01Virex',
    description: '把“深度求索中…”替换为轮换文案，支持打字机、彩色渐变、弹幕和主题词库，可在设置中编辑。',
    category: '界面增强', url: 'https://github.com/01Virex/dsh-status-rotator',
    review: { version: '0.35.0', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0', combinations: [{ dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0' }, { dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.12.0' }], platforms: ['Mac（隔离 Web 宿主）'],
      sha256: '0d5e848d5edd6fb97098a54ce393989330e3f63bf42ad6cde87527e2128c3c7d',
      note: '固定 npm 发行包，源码与包逐文件核对。两宿主与 OMD 的两种加载顺序、原生设置贡献、启停、重启及卸载已核验；未实测原生桌面 App、Windows/Linux 或全部动态文案效果。' },
  },
  {
    id: 'dsh-blender-plugin', name: 'DSH × Blender', packageName: '@dsh-external/dsh-blender-plugin', author: 'sixtysevenlf',
    description: '让模型直接操控 Blender：查看视口、编辑场景、渲染、批量任务与事务回滚。需要 Blender 及配套连接插件。',
    category: '三维创作', url: 'https://github.com/sixtysevenlf/dsh-blender-plugin',
    githubRelease: 'sixtysevenlf/dsh-blender-plugin',
    review: { version: '1.0.5', releaseTag: 'v1.0.5', asset: 'dsh-external-dsh-blender-plugin-1.0.5.tgz', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0', combinations: [{ dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0' }, { dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.12.0' }], platforms: ['Mac（隔离 Web 宿主）'],
      sha256: '7277a45b6c7b6d5f7ffe1dcd36ac0e83d24b666c3dd4ed9b3730d71c18d1195e',
      note: '固定 GitHub 标准发行资产；两宿主原生安装、15 个工具声明、设置、两种加载顺序、启停、重启、卸载及后台进程清理已核验。仍需配置 Blender 端连接；实际视口、几何、渲染与事务未验收，Linux 资产与同版本源码有共享路径差异，Windows/Linux 未实测。' },
  },
  {
    id: 'dsh-whale-widget', name: '小鲸鱼记账挂件', packageName: 'dsh-whale-widget', author: 'MeteorNOX',
    description: '在 DSH 界面显示 DeepSeek 余额、今日用量与每轮消耗，支持拖拽吸附、自定义角色和互动泡泡。',
    category: '用量管理', url: 'https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget',
    review: { version: '0.3.18', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0', combinations: [{ dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.12.0' }, { dsh: '0.2.1-alpha.1', omd: '0.2.1-alpha.1.omd.0.12.0' }], platforms: ['Mac（隔离 Web 宿主）'],
      sha256: '81045aa394d3dadd5100d52159697e8381f82f63d65f4d2c57029b558dcc0efd',
      note: '固定 DSH npm 支线，保持与 Codex 支线区分。两宿主原生安装、OMD 两种加载顺序、无凭据服务、设置贡献、启停、重启与卸载已核验；真实余额、计费、拖拽及原生桌面未作完整业务验收。' },
  },
];

export function resolveRecommendedPlugin(plugin, hostVersion) {
  if (!plugin.hostBuilds) return plugin;
  const supportedHosts = Object.keys(plugin.hostBuilds);
  const review = typeof hostVersion === 'string' && Object.hasOwn(plugin.hostBuilds, hostVersion) ? plugin.hostBuilds[hostVersion] : undefined;
  if (plugin.unavailable && (!plugin.unavailableHosts || plugin.unavailableHosts.includes(hostVersion))) return { ...plugin, review };
  if (!review) return { ...plugin, review: undefined, unavailable: hostVersion ? `当前 DSH ${hostVersion} 没有已核验的对应构建，暂不提供安装或更新。支持的完整宿主版本：${supportedHosts.join('、')}。已有安装仍可卸载。` : '未能核实当前 DSH 完整版本，暂不提供安装或更新。已有安装仍可卸载。', unavailableHosts: undefined };
  const valid = review.dsh === hostVersion && typeof review.version === 'string' && review.version.startsWith(hostVersion + '.iui.') && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(review.version.slice((hostVersion + '.iui.').length)) && review.releaseTag === 'v' + review.version && review.asset === plugin.packageName + '-' + review.version + '.tgz' && /^[a-f0-9]{64}$/.test(review.sha256 ?? '');
  return { ...plugin, review, unavailable: valid ? null : `DSH ${hostVersion} 对应的 Intelligent UI 核验发行包尚未准备完成，暂不提供安装或更新。`, unavailableHosts: undefined };
}
