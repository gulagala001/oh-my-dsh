// Only this curated catalog supplies package names to the installer.
// Bundled features use their existing host entry instead of installing a second copy.
export const recommendedPlugins = [
  {
    id: 'billion-context', name: 'Billion Context', packageName: 'billion-context', author: 'ranxianglei',
    description: '管理长会话的上下文压缩、原文恢复和缓存诊断；在 OMD 上下文页按会话切换。',
    category: '上下文管理', url: 'https://github.com/ranxianglei/billion-context',
    requireReviewedVersion: true, supportedHostVersions: ['0.2.1-rc.5', '0.2.1-rc.2', '0.2.1-rc.3'],
    review: { version: '0.1.202', dsh: '0.2.1-rc.5',
      sha256: 'b42958e6bed13ee0afd5460ed9b88cabb10072254abe0d2b7e9f1ea45cc4f397',
      note: '原作者固定 npm 包。按会话切换压缩后端，保留归档、Dream、任务和回查。BC 自身自动更新独立于此目录；更改版本后需重新核验适配。' },
  },
  {
    id: 'dsh-ops', name: 'dsh-ops', packageName: 'dsh-ops', versionSuffix: 'ops',
    author: '原作者：T-Auto · 兼容适配：gulagala001',
    description: '增强文件、文档与命令操作，按需加载工具并复用结果；支持普通模式和 PTC，保留原生工具。',
    category: '操作工具', url: 'https://github.com/T-Auto/dsh-ops', githubRelease: 'gulagala001/oh-my-dsh',
    supportedRuntimeTargets: ['darwin-arm64', 'linux-x64', 'win32-x64'], requireReviewedVersion: true,
    hostBuilds: {
      '0.2.1-rc.3': { version: '0.2.1-rc.3.ops.0.1.0', upstreamVersion: '0.4.1', releaseVersion: '0.2.1-rc.3.omd.0.100.1', releaseTag: 'v0.2.1-rc.3.omd.0.100.1', asset: 'dsh-ops-0.2.1-rc.3.ops.0.1.0.tgz', sha256: '67441ed60ef962eb17292c8865cca6b70f4bf293fd05f62f94fdb85c5ece711f', dsh: '0.2.1-rc.3', allowPrerelease: true },
      '0.2.1-rc.2': { version: '0.2.1-rc.2.ops.0.1.0', upstreamVersion: '0.4.1', releaseVersion: '0.2.1-rc.2.omd.0.99.0', releaseTag: 'v0.2.1-rc.2.omd.0.99.0', asset: 'dsh-ops-0.2.1-rc.2.ops.0.1.0.tgz', sha256: 'd2a13073db75f11b7262b388c786bfb8fab35e541e35938f67bc0dd90dfe04c5', dsh: '0.2.1-rc.2', allowPrerelease: true },
      '0.2.1-rc.1': { version: '0.2.1-rc.1.ops.0.1.0', upstreamVersion: '0.4.1', releaseVersion: '0.2.1-rc.1.omd.0.99.0', releaseTag: 'v0.2.1-rc.1.omd.0.99.0', asset: 'dsh-ops-0.2.1-rc.1.ops.0.1.0.tgz', sha256: '5343ead8b3816f0e070f254da5cc95a98abb173fc3440881888c16d55f8b325c', dsh: '0.2.1-rc.1', allowPrerelease: true },
    },
  },
  {
    id: 'dsh-deepseek-workbench', name: 'DeepSeek 工作台', section: 'features', moduleName: 'oh-my-dsh/deepseek-workbench', packageName: 'dsh-deepseek-workbench', author: 'gulagala001',
    description: '使用 DeepSeek 网页聊天、临时侧栏与开放平台，将网页历史导入 DSH 后继续对话。',
    category: '内置工作台', bundled: true,
    url: 'https://github.com/gulagala001/dsh-deepseek-workbench',
  },
  {
    id: 'dsh-extensions', name: '扩展管理', section: 'features', moduleName: 'oh-my-dsh/extensions', packageName: 'dsh-extensions', author: 'gulagala001',
    description: '在插件页管理 Skill、MCP、指令文件、自定义命令和 Hooks。',
    category: '内置扩展管理', bundled: true,
    url: 'https://github.com/gulagala001/dsh-extensions',
  },
  {
    id: 'dsh-intelligent-ui', name: '智能交互回答', section: 'features', versionSuffix: 'iui', packageName: 'dsh-intelligent-ui', author: 'gulagala001',
    description: '在回答中使用交互图表、表单、计算器、模拟和小游戏。',
    category: '界面增强', url: 'https://github.com/gulagala001/dsh-intelligent-ui', githubRelease: 'gulagala001/dsh-intelligent-ui',
    hostBuilds: {
      '0.2.1-rc.3': { version: '0.2.1-rc.3.iui.1.0.13', releaseTag: 'v0.2.1-rc.3.iui.1.0.13', asset: 'dsh-intelligent-ui-0.2.1-rc.3.iui.1.0.13.tgz', sha256: 'e3a0b0744bf137905ec9ae70e6300b5907ce83c4fde6234f8a1f3a56664a8362', dsh: '0.2.1-rc.3', allowPrerelease: false },
      '0.2.1-rc.2': { version: '0.2.1-rc.2.iui.1.0.12', releaseTag: 'v0.2.1-rc.2.iui.1.0.12', asset: 'dsh-intelligent-ui-0.2.1-rc.2.iui.1.0.12.tgz', sha256: '04087b3832f018e9d2ff186b029c9561f52328741a4028fbfcf79bbed37e54f6', dsh: '0.2.1-rc.2', allowPrerelease: false },
      '0.2.1-rc.1': { version: '0.2.1-rc.1.iui.1.0.12', releaseTag: 'v0.2.1-rc.1.iui.1.0.12', asset: 'dsh-intelligent-ui-0.2.1-rc.1.iui.1.0.12.tgz', sha256: 'e2cbfe4af65064003f0d0db347c2231127be4493ceff7e332146bde8c8f325c3', dsh: '0.2.1-rc.1', allowPrerelease: false },
    },
    historicalHostBuilds: {
      '0.2.1-rc.2': { version: '0.2.1-rc.2.iui.1.0.9' },
      '0.2.1-rc.1': { version: '0.2.1-rc.1.iui.1.0.8' },
      '0.2.0-rc.2': { version: '0.2.0-rc.2.iui.1.0.2', releaseTag: 'v0.2.0-rc.2.iui.1.0.2', asset: 'dsh-intelligent-ui-0.2.0-rc.2.iui.1.0.2.tgz', sha256: 'd45fcd994d9ceadec4c62a952b0e8471c5078f2912ce29c587bdcd9574c58459', dsh: '0.2.0-rc.2',
        note: '仅保留旧 1.0.2 构建身份供历史安装识别与显式迁移，不是当前 1.0.6 构建或新版 OMD 验收记录。' },
      '0.2.1-alpha.2': { version: '0.2.1-alpha.2.iui.1.0.2', releaseTag: 'v0.2.1-alpha.2.iui.1.0.2', asset: 'dsh-intelligent-ui-0.2.1-alpha.2.iui.1.0.2.tgz', sha256: '12b350261a5c9b865603b52e4ab105c30e6f569af7b9ec5ba8fa170e9b4bdfa3', dsh: '0.2.1-alpha.2',
        note: '仅保留旧 1.0.2 构建身份供历史安装识别与显式迁移，不是当前 1.0.6 构建或新版 OMD 验收记录。' },
      '0.2.1-alpha.1': { version: '0.2.1-alpha.1.iui.1.0.2', releaseTag: 'v0.2.1-alpha.1.iui.1.0.2', asset: 'dsh-intelligent-ui-0.2.1-alpha.1.iui.1.0.2.tgz', sha256: 'f43842d424cb6a4eee84e6bd22bc1b055e2ad261826cec73b2e9a814f2e3813b', dsh: '0.2.1-alpha.1',
        note: '仅保留旧 1.0.2 构建身份供历史安装识别与显式迁移，不是当前 1.0.6 支持宿主或新版 OMD 验收记录。' },
    },
  },
  {
    id: 'oh-my-agents-above-all', name: '智能体预设', section: 'features', versionSuffix: 'omaa',
    packageName: 'oh-my-agents-above-all', author: 'gulagala001',
    description: '选用 Codex、Claude Code、Grok、Pi 与 ZCode 风格的智能体，沿用 DSH 会话和工具。',
    category: '智能体', url: 'https://github.com/gulagala001/oh-my-agents-above-all', githubRelease: 'gulagala001/oh-my-agents-above-all',
    hostBuilds: {
      '0.2.1-rc.3': { version: '0.2.1-rc.3.omaa.0.17.6', releaseTag: 'v0.2.1-rc.3.omaa.0.17.6', asset: 'oh-my-agents-above-all-0.2.1-rc.3.omaa.0.17.6.tgz', sha256: '8f230389085b6e4470349a19accacdad84086f7afbf6f64554869da9af128f67', dsh: '0.2.1-rc.3', allowPrerelease: false },
      '0.2.1-rc.2': { version: '0.2.1-rc.2.omaa.0.17.0', releaseTag: 'v0.2.1-rc.2.omaa.0.17.0', asset: 'oh-my-agents-above-all-0.2.1-rc.2.omaa.0.17.0.tgz', sha256: '4ecd4e4d0f7928729bf5074ea2e576d4e7bc655121add66147006a458143d7d4', dsh: '0.2.1-rc.2', allowPrerelease: false },
      '0.2.1-rc.1': { version: '0.2.1-rc.1.omaa.0.16.5', releaseTag: 'v0.2.1-rc.1.omaa.0.16.5', asset: 'oh-my-agents-above-all-0.2.1-rc.1.omaa.0.16.5.tgz', sha256: 'e67576fda249ee29f4e521abaf110cdeefed3d386010239a3c53b74724bf5d9d', dsh: '0.2.1-rc.1', allowPrerelease: false },
    },
  },
  {
    id: 'dsh-plugin-subscriptions', name: '订阅登录', packageName: 'dsh-plugin-subscriptions', author: 'V1ki',
    description: '登录 ChatGPT、Claude、Grok、Copilot 或 Antigravity 订阅，自动发现模型；支持 ChatGPT Fast、订阅额度及生图。',
    category: '模型能力', url: 'https://github.com/V1ki/dsh-plugin-subscriptions', supportedHostVersions: ['0.2.1-rc.5'],
    review: { version: '0.9.12', dsh: '0.2.1-rc.5', sha256: '6084a2000ec032f855f50503a46383c3355efc24242220cd4398bd40996c336c',
      note: '原作者固定 npm 包；已核验 rc.5 原生安装、启动与设置入口。账号登录、真实额度及付费模型调用需用户配置。' },
  },
  {
    id: 'dsh-open-design', name: '设计技能 · OpenDesign', packageName: 'dsh-open-design', author: 'omegapaopao · 技能来源：nexu-io/open-design 及各技能作者',
    description: '使用 52 个设计技能、模板和设计系统，技能入口为 open-design。',
    category: '设计创作', url: 'https://github.com/omegapaopao/dsh-open-design',
    githubRelease: 'gulagala001/oh-my-dsh',
    review: { version: '0.1.0-omd.1.0.0', releaseTag: 'opendesign-v0.1.0-omd.1.0.0', dsh: '0.2.0-rc.2', omd: '0.2.0-rc.2.omd.0.4.0', platforms: ['Mac'],
      sha256: '6f9f1e87b524fa412c64d890c1be55a48a94d7f0dd0ec96f82e804fec75645cc',
      note: '固定上游 a9d4f4c 的 OMD 适配包，非上游官方发行。52技能、同名项目优先、原生安装启停卸载和checker已在隔离Mac验证；保留许可与来源。真实模型设计、联网技能和Windows尚未验收。发行包锁定此桥接版本，不跟随OMD主插件tag更新。' },
  },
  {
    id: 'omd-intent-assistant', name: '需求理解', packageName: 'omd-prompt-optimizer', versionSuffix: 'intent',
    author: '原作者：啃轮胎的西狐（WestFox-AwA） · 兼容适配：gulagala001',
    upstream: { name: 'dsh-prompt-optimizer', url: 'https://github.com/WestFox-AwA/dsh-prompt-optimizer' },
    description: '发送前梳理本轮需求，保留原话，支持审查、自动模式和只读查证；启用后可在输入框选择模式。',
    category: '模型能力', url: 'https://github.com/gulagala001/omd-prompt-optimizer',
    githubRelease: 'gulagala001/oh-my-dsh', requireReviewedVersion: true,
    hostBuilds: {
      '0.2.1-rc.3': { version: '0.2.1-rc.3.intent.0.3.3', upstreamVersion: '0.3.0', releaseVersion: '0.2.1-rc.3.omd.1.0.1', releaseTag: 'v0.2.1-rc.3.omd.1.0.1', asset: 'omd-prompt-optimizer-0.2.1-rc.3.intent.0.3.3.tgz', sha256: 'd5ee05d821d009161d3c42e3d4b0b1319436eced0dd431f91bb68ae5db74af75', dsh: '0.2.1-rc.3', allowPrerelease: false },
    },
  },
  {
    id: 'dsh-market', name: '插件市场', packageName: 'dshmarket', author: 'dsh-market',
    description: '在 DSH 内浏览、搜索和安装社区插件与主题，支持分类筛选、更新管理及配置备份。安装后在设置中打开插件市场。',
    category: '插件管理', url: 'https://github.com/dsh-market/dsh-market',
    supportedHostVersions: ['0.2.1-rc.5', '0.2.1-rc.3'],
    review: { version: '1.70.3', dsh: '0.2.1-rc.5',
      sha256: 'bf7b4ed2446e984bcf73276b328b6827a46727e88f7a0cba96d82ebab90dceb1',
      note: '原作者固定发行包；已核验 rc.5 原生安装、启动与基础界面。外部账号、服务及其他平台需各自配置和验证。' },
  },
  {
    id: 'dsh-infinite-gen-4', name: '无限四代', packageName: 'dsh-infinite-gen-4', author: 'Minglink',
    description: '用于提示词对抗研究和回复状态展示；启用后会向所有会话注入内容生成提示词。',
    category: '红队研究', url: 'https://github.com/Minglink/dsh-infinite-gen-4',
    review: { version: '0.4.0', dsh: '0.1.7-rc.2', omd: '0.1.7-rc.2.19', platforms: ['Web'],
      source: { repository: 'Minglink/dsh-infinite-gen-4', commit: '5e377394fe9d6aeab6380e2a5a5f959bc1384426' },
      sha256: '9e6d66001eb06fc790d6eae91d191175b53503521b7f4db8c92a061a111752b1',
      note: '固定四代源码快照，0.4.0 为源码标注版本，非正式发行包；旧标签指向三代，仓库当前主线为五代。2026-10-09 已逐文件核对更名后的官方归档与固定 Git tree，并直接以原归档在 rc.2/alpha.1 原生宿主核验安装、工具声明、启停、重启与卸载；不跟随五代。保留上游提示词与 MIT 许可；不宣称真实模型研究效果，桌面及 Windows 未实测。' },
  },
  {
    id: 'dsh-status-rotator', name: '动态思考文案', packageName: 'dsh-status-rotator', author: '01Virex',
    description: '把“深度求索中…”替换为轮换文案，支持打字机、彩色渐变、弹幕和主题词库，可在设置中编辑。',
    category: '界面增强', url: 'https://github.com/01Virex/dsh-status-rotator',
    supportedHostVersions: ['0.2.1-rc.5', '0.2.1-rc.3'],
    review: { version: '0.38.0', dsh: '0.2.1-rc.5',
      sha256: '83e4388bdfdf6b583a4efb03064bdd00b823c4feb8dc3358a2dde2f6907c75c1',
      note: '原作者固定发行包；已核验 rc.5 原生安装、启动与基础界面。外部账号、服务及其他平台需各自配置和验证。' },
  },
  {
    id: 'dsh-blender-plugin', name: 'DSH × Blender', packageName: '@dsh-external/dsh-blender-plugin', author: 'sixtysevenlf',
    description: '让模型直接操控 Blender：查看视口、编辑场景、渲染、批量任务与事务回滚。需要 Blender 及配套连接插件。',
    category: '三维创作', url: 'https://github.com/sixtysevenlf/dsh-blender-plugin',
    githubRelease: 'sixtysevenlf/dsh-blender-plugin',
    supportedHostVersions: ['0.2.1-rc.3'],
    review: { version: '2.6.1', releaseTag: 'v2.6.1', asset: 'dsh-external-dsh-blender-plugin-2.6.1.tgz', dsh: '0.2.1-rc.3',
      sha256: 'ed00e3d2bec9ddf67f9f837a181811832c152bb60f8680b3a8d58ebc0a6f662e',
      note: '原作者固定发行包；已核验 rc.3 原生安装、启动与基础界面。外部账号、服务及其他平台需各自配置和验证。' },
  },
  {
    id: 'dsh-whale-widget', name: '小鲸鱼记账挂件', packageName: 'dsh-whale-widget', author: 'MeteorNOX',
    description: '在 DSH 界面显示 DeepSeek 余额、今日用量与每轮消耗，支持拖拽吸附、自定义角色和互动泡泡。',
    category: '用量管理', url: 'https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget',
    supportedHostVersions: ['0.2.1-rc.3'],
    review: { version: '0.4.2', dsh: '0.2.1-rc.3',
      sha256: '2368de8192c4ba28682a6344f78ace11cb41bac397c13981e36dfca49c0ebc78',
      note: '原作者固定发行包；已核验 rc.3 原生安装、启动与基础界面。外部账号、服务及其他平台需各自配置和验证。' },
  },
];

export function resolveRecommendedPlugin(plugin, hostVersion) {
  if (plugin.supportedHostVersions && !plugin.supportedHostVersions.includes(hostVersion)) return { ...plugin,
    unavailable: `此适配当前支持 DSH ${plugin.supportedHostVersions.join('、')}；其他宿主暂不提供安装或更新。已有安装仍可停用或卸载。`, unavailableHosts: undefined };
  if (!plugin.hostBuilds) return plugin;
  const supportedHosts = Object.keys(plugin.hostBuilds);
  const review = typeof hostVersion === 'string' && Object.hasOwn(plugin.hostBuilds, hostVersion) ? plugin.hostBuilds[hostVersion] : undefined;
  if (plugin.unavailable && (!plugin.unavailableHosts || plugin.unavailableHosts.includes(hostVersion))) return { ...plugin, review };
  if (!review) return { ...plugin, review: undefined, unavailable: hostVersion ? `当前 DSH ${hostVersion} 没有已核验的对应构建，暂不提供安装或更新。支持的完整宿主版本：${supportedHosts.join('、')}。已有安装仍可卸载。` : '未能核实当前 DSH 完整版本，暂不提供安装或更新。已有安装仍可卸载。', unavailableHosts: undefined };
  const prefix = hostVersion + '.' + (plugin.versionSuffix || 'iui') + '.';
  const valid = review.dsh === hostVersion && typeof review.version === 'string' && review.version.startsWith(prefix) && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(review.version.slice(prefix.length)) && review.releaseTag === 'v' + (review.releaseVersion || review.version) && (!review.releaseVersion || (review.releaseVersion.startsWith(hostVersion + '.omd.') && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(review.releaseVersion.slice((hostVersion + '.omd.').length)))) && review.asset === plugin.packageName + '-' + review.version + '.tgz' && /^[a-f0-9]{64}$/.test(review.sha256 ?? '');
  return { ...plugin, review, unavailable: valid ? null : `DSH ${hostVersion} 对应的 ${plugin.name} 核验发行包尚未准备完成，暂不提供安装或更新。`, unavailableHosts: undefined };
}
