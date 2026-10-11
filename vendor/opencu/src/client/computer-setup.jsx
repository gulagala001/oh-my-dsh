import React, { useCallback, useEffect, useState } from 'react';
import { usePollingAction } from './use-polling-action.mjs';
import { CodexCuSettings, CodexCuBrowserControlIcon } from './codex-cu-settings.jsx';
import { CodexCuButton } from './codex-cu-primitives.jsx';
import {
  CodexCuSettingsSection, CodexCuSettingsSectionHeader, CodexCuSettingsSectionContent,
  CodexCuSettingsGroup, CodexCuSettingsRow, CodexCuSettingsEmpty,
} from './codex-cu-settings-primitives.jsx';
import {
  CodexCuDialog, CodexCuDialogBody, CodexCuDialogSection,
  CodexCuDialogHeader, CodexCuDialogTitle, CodexCuDialogDescription,
} from './codex-cu-dialog.jsx';
import { CodexSystemAccessCard } from './codex-system-access.jsx';
import { CodexLockedComputerUseInstallOption } from './codex-cu-install-disclosure.jsx';
import { getScreenLockSetupState } from './codex-screen-lock-setup.mjs';
import { CodexComputerUsePluginIconUrl, CodexCuBrowserLogoUrl, CodexCuIcon } from './codex-cu-icons.jsx';
import { CodexCuScope } from './codex-cu-scope.jsx';
import { formatCodexCuMessage } from './codex-cu-i18n.mjs';

// Local install/permission facts are not Codex account or marketplace gates.
const localIds = { native: 'opencu-native-installation', browser: 'opencu-browser-installation' };
const known = value => typeof value === 'boolean';
const permissionValue = value => value === true ? '已开启' : value === false ? '待开启' : '未检测';
const readinessValue = value => value === true ? '可用' : value === false ? '当前不可用' : '未检测';

function MaintenanceSection({ title, children }) {
  return <CodexCuSettingsSection><CodexCuSettingsSectionHeader title={title} /><CodexCuSettingsSectionContent><CodexCuSettingsGroup>{children}</CodexCuSettingsGroup></CodexCuSettingsSectionContent></CodexCuSettingsSection>;
}

function MaintenanceRow({ title, children, action, error = false }) {
  return <CodexCuSettingsRow label={title} description={error ? <span role="alert">{children}</span> : children} control={action ?? null} />;
}

function ScreenLockMaintenance({ native, busy, blocked, act }) {
  const [operation, setOperation] = useState(null);
  const state = getScreenLockSetupState(native);
  if (!state) return null;
  const canRun = operation === 'install-screen-lock' ? state.canInstall : operation === 'remove-screen-lock' ? state.canRemove : operation === 'recover-screen-lock' ? state.canRecover : false;
  const requesting = ['install-screen-lock', 'remove-screen-lock', 'recover-screen-lock'].includes(busy);
  const messages = operation === 'remove-screen-lock' ? {
    title: '移除锁屏操控', subtitle: '系统授权后恢复原有登录策略并移除锁屏组件', allowAccess: '授权并移除',
  } : operation === 'recover-screen-lock' ? {
    title: '恢复锁屏系统配置', subtitle: '系统授权后恢复未完成安装前的配置', allowAccess: '授权并恢复',
  } : {
    title: '安装锁屏操控', subtitle: '系统将要求授权，安装 OpenCU 锁屏组件', allowAccess: '授权并安装',
  };
  const authorize = async () => {
    if (blocked || !canRun) return;
    await act(operation);
    setOperation(null);
  };
  return <>
    <MaintenanceSection title="OpenCU 锁屏操控">
      <MaintenanceRow title="系统安装" action={<span>{state.status}</span>} error={!!state.error}>{state.error ?? (state.supported ? '锁屏组件需要独立系统授权。安装完成后仍需检查运行权限。' : '此端不支持安装锁屏组件。')}</MaintenanceRow>
      {state.installed ? <MaintenanceRow title="锁屏运行状态" action={<span>{state.runtimeStatus}</span>} error={!!state.runtimeError}>{state.runtimeError ?? state.runtime?.provider?.reason ?? '由本端锁屏控制程序检测'}</MaintenanceRow> : null}
      {state.canRecover ? <MaintenanceRow title="恢复未完成的安装" action={<CodexCuButton color="secondary" size="toolbar" disabled={blocked} onClick={() => setOperation('recover-screen-lock')}>恢复系统配置</CodexCuButton>}>上一次系统安装未完整结束。请先恢复配置，再重新安装。</MaintenanceRow> : null}
      {state.canRemove ? <MaintenanceRow title="移除锁屏组件" action={<CodexCuButton color="danger" size="toolbar" disabled={blocked} onClick={() => setOperation('remove-screen-lock')}>移除锁屏操控</CodexCuButton>}>恢复原有系统登录策略，桌面控制与用户文件保留。</MaintenanceRow> : null}
    </MaintenanceSection>
    {state.canInstall ? <CodexLockedComputerUseInstallOption enabled={operation === 'install-screen-lock'} disabled={blocked}
      onChange={enabled => setOperation(enabled ? 'install-screen-lock' : null)}
      onOpenLink={url => window.open(url, '_blank', 'noopener,noreferrer')}
      messages={{ title: '锁屏操控', description: '允许 OpenCU 在 Mac 锁屏时操控应用。', learnMore: '了解更多', toggle: '安装锁屏操控' }} /> : null}
    {operation != null ? <CodexSystemAccessCard isRequesting={requesting || state.busy} prerequisitesPending={blocked || !canRun}
      onAllowAccess={authorize} onNotNow={() => setOperation(null)} messages={{ ...messages, notNow: '暂不处理' }} /> : null}
  </>;
}

function NativeMaintenance({ native, busy, blocked, act, onClose }) {
  if (!native) return null;
  const installed = native.installed === true;
  const screenLockInstallation = native.screenLockInstallation;
  const screenLockRequiresRemoval = screenLockInstallation?.installed === true || screenLockInstallation?.registered === true;
  const screenLockStateUnknown = native.platform === 'darwin' && screenLockInstallation?.supported !== false && !known(screenLockInstallation?.installed);
  const screenLockRemovalBlocked = screenLockRequiresRemoval || screenLockStateUnknown;
  const needsPermission = installed && native.platform !== 'win32' && (native.accessibility === false || native.screenRecording === false);
  const update = native.repairRequired || native.updateAvailable || native.restartRequired;
  const updateLabel = native.repairRequired ? '修复桌面控制' : native.updateAvailable ? '更新桌面控制' : '重启桌面控制';
  return <>
    {native.error && <MaintenanceSection title="状态读取失败"><MaintenanceRow title="桌面控制" error>{native.error}</MaintenanceRow></MaintenanceSection>}
    {native.supported === false ? <MaintenanceSection title="本端支持"><MaintenanceRow title="原生应用控制">此系统版本尚不支持原生应用控制。浏览器功能可单独使用。</MaintenanceRow></MaintenanceSection> : null}
    {native.external && native.supported && <MaintenanceSection title={native.bridge ? 'WSL · Windows 桌面' : '手动管理桌面控制'}><MaintenanceRow title="本端程序">{native.installed === false ? '未找到指定的桌面程序，请检查桌面控制程序路径。' : native.restartRequired ? '桌面程序已替换，请重启 DSH 服务或完整重启应用与 Host 后重新选择应用。' : native.repairRequired || native.updateAvailable ? '请手动更新或修复指定的桌面程序，再重启 DSH 服务或完整重启应用与 Host。' : '使用指定的 Windows 桌面程序；更新和移除由你手动管理。'}</MaintenanceRow></MaintenanceSection>}
    {native.supported && native.installed === false && !native.external ? <MaintenanceSection title="安装桌面控制"><MaintenanceRow title="OpenCU 本端安装" action={<CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'install-native' || native.installing} onClick={() => act('install-native')}>安装桌面控制</CodexCuButton>}>{native.platform === 'win32' ? 'Windows 开发版采用前台操控，安装时会在本机编译，需要 .NET 10 SDK。请保持桌面解锁；鼠标或键盘介入会停止助手。' : '安装 Oh My DSH Computer Use 后，可选择并操作 Mac 应用。当前开发版会在本机编译，需要 Apple Command Line Tools；发行版安装包尚未提供。'}</MaintenanceRow></MaintenanceSection> : null}
    {installed && !native.external && update ? <MaintenanceSection title={updateLabel}><MaintenanceRow title="OpenCU 本端维护" action={<CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'install-native' || native.installing} onClick={() => act('install-native')}>{updateLabel}</CodexCuButton>}>会暂停当前桌面操作，完成后请重新选择应用。</MaintenanceRow></MaintenanceSection> : null}
    {needsPermission ? <CodexSystemAccessCard isRequesting={busy === 'permissions'} prerequisitesPending={blocked && busy !== 'permissions'} onAllowAccess={() => act('permissions')} onNotNow={onClose} messages={{ title: '屏幕与辅助功能', subtitle: 'OpenCU 需要系统授权', notNow: '暂不处理', allowAccess: '打开权限设置' }} /> : null}
    {installed ? <MaintenanceSection title="OpenCU 系统状态">
      {native.platform === 'win32' ? <><MaintenanceRow title="Windows 桌面" action={<span>{readinessValue(native.interactive)}</span>}>前台操控；保持桌面解锁，鼠标或键盘介入会停止助手。</MaintenanceRow><MaintenanceRow title="窗口捕获" action={<span>{readinessValue(native.captureSupported)}</span>}>向助手提供所选应用的画面</MaintenanceRow></> : <><MaintenanceRow title="辅助功能" action={<span>{permissionValue(native.accessibility)}</span>}>读取应用控件并操作所选窗口</MaintenanceRow><MaintenanceRow title="屏幕录制" action={<span>{permissionValue(native.screenRecording)}</span>}>向助手提供所选应用的画面</MaintenanceRow><MaintenanceRow title="系统设置中的应用名称" action={<CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'permissions'} onClick={() => act('permissions')}>打开权限设置</CodexCuButton>}>{native.displayName ?? 'Oh My DSH Computer Use'}</MaintenanceRow></>}
    </MaintenanceSection> : null}
    <ScreenLockMaintenance native={native} busy={busy} blocked={blocked} act={act} />
    {installed && (native.version != null || native.runningVersion != null || native.removable) ? <MaintenanceSection title="OpenCU 桌面控制版本">
      {native.version != null ? <MaintenanceRow title="已安装版本">{native.version}</MaintenanceRow> : null}
      {native.runningVersion != null && native.runningVersion !== native.version ? <MaintenanceRow title="正在运行版本">{native.runningVersion}</MaintenanceRow> : null}
      {native.removable ? <MaintenanceRow title="移除桌面控制" action={<CodexCuButton color="danger" size="toolbar" disabled={blocked || screenLockRemovalBlocked} loading={busy === 'remove-native' || native.removing} onClick={() => !screenLockRemovalBlocked && act('remove-native')}>移除桌面控制</CodexCuButton>}>{screenLockRequiresRemoval ? '锁屏组件仍已安装或注册。请先移除锁屏组件，再移除桌面控制。' : screenLockStateUnknown ? '锁屏组件状态尚未确认。请重新检查后再移除桌面控制。' : '移除会停止桌面操控与预览，应用窗口和用户文件保留。需要时可重新安装。'}</MaintenanceRow> : null}
    </MaintenanceSection> : null}
  </>;
}

function BrowserMaintenance({ browser, platform, busy, blocked, act }) {
  if (!browser) return null;
  return <MaintenanceSection title="OpenCU 内置浏览器">
    <MaintenanceRow title={browser.name ?? 'OpenCU 浏览器'} error={!!browser.error} action={browser.installed === false ? <CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'install-browser'} onClick={() => act('install-browser')}>安装浏览器</CodexCuButton> : null}>{browser.error ?? (browser.installed === true ? '已安装 · 独立工作配置' : browser.installed === false ? '安装 OpenCU 配套浏览器与本端控制程序。' : '安装状态未检测')}</MaintenanceRow>
    {known(browser.running) ? <MaintenanceRow title="运行状态">{browser.running ? '正在运行' : '未启动'}</MaintenanceRow> : null}
    {browser.path != null ? <MaintenanceRow title="浏览器路径"><code>{browser.path}</code></MaintenanceRow> : null}
    <MaintenanceRow title="浏览器配置">网页登录保存在独立配置中。{platform === 'darwin' ? '首次使用可能需要在 macOS 系统提示中允许浏览器访问钥匙串。' : ''}</MaintenanceRow>
  </MaintenanceSection>;
}

function ExtensionMaintenance({ extension, busy, blocked, act, copy, copied }) {
  if (!extension) return null;
  const installation = extension.installation;
  const connected = Array.isArray(extension.browsers) && extension.browsers.length > 0;
  const canPrepare = installation?.supported === true && (installation.prepared === false || installation.prepared === true && (installation.updateAvailable || installation.superseded));
  const prepareLabel = installation?.superseded ? '切换 Chrome 到当前实例' : installation?.updateAvailable ? '更新 Chrome 连接' : '准备 Chrome 连接';
  return <>
    <MaintenanceSection title="OpenCU Chrome 扩展连接">
      <MaintenanceRow title="浏览器连接" error={!!extension.error}>{extension.error ?? (connected ? `${extension.browsers.map(browser => browser.name).join('、')} · 使用已有网页和登录状态` : '连接日常使用的浏览器')}</MaintenanceRow>
      {installation?.error && installation.error !== extension.error ? <MaintenanceRow title="连接程序状态读取失败" error>{installation.error}</MaintenanceRow> : null}
      {installation?.superseded ? <MaintenanceRow title="当前连接">Chrome 当前连接到另一套 Oh My DSH。需要在这里使用时，可手动切换到当前实例。</MaintenanceRow> : null}
      {canPrepare ? <MaintenanceRow title={prepareLabel} action={<CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'install-extension' || installation.preparing} onClick={() => act('install-extension')}>{prepareLabel}</CodexCuButton>}>准备连接程序时会自动迁移已有的 Oh My DSH 连接，保留扩展目录。首次使用仍需在 Chrome 开启开发者模式并加载扩展。{installation.platform === 'win32' ? 'Windows 首次准备需要 .NET 10 SDK，用于编译本机连接程序。' : ''}</MaintenanceRow> : null}
      {installation?.supported === false && !connected ? <MaintenanceRow title="本端支持">此平台的扩展安装程序尚未完成，内置浏览器可单独使用。</MaintenanceRow> : null}
    </MaintenanceSection>
    {installation?.prepared === true && (!connected || installation.reloadRequired) ? <MaintenanceSection title={installation.reloadRequired ? '重新加载扩展' : '加载 Chrome 扩展'}>
      <MaintenanceRow title="Chrome 扩展管理页" action={<CodexCuButton color="secondary" size="toolbar" onClick={() => copy('chrome://extensions', 'page')}>{copied === 'page' ? '已复制地址' : '复制扩展页地址'}</CodexCuButton>}>{installation.reloadRequired ? '扩展文件已更新，请在 Chrome 扩展管理页重新加载 Oh My DSH Computer Use。' : '在 Chrome 地址栏打开 chrome://extensions，开启「开发者模式」，点击「加载已解压的扩展程序」，选择下面的目录。'}</MaintenanceRow>
      {installation.extensionPath != null ? <MaintenanceRow title="扩展目录" action={<CodexCuButton color="secondary" size="toolbar" onClick={() => copy(installation.extensionPath, 'folder')}>{copied === 'folder' ? '已复制目录' : '复制扩展目录'}</CodexCuButton>}><code>{installation.extensionPath}</code></MaintenanceRow> : null}
      <MaintenanceRow title="连接结果">加载成功后会自动显示「已连接」。</MaintenanceRow>
    </MaintenanceSection> : null}
    {installation ? <MaintenanceSection title="OpenCU Chrome 连接维护">
      {installation.version != null ? <MaintenanceRow title="扩展版本">{installation.version}</MaintenanceRow> : null}
      {known(installation.prepared) ? <MaintenanceRow title="本机连接程序">{installation.prepared ? '已就绪' : '尚未准备'}</MaintenanceRow> : null}
      {installation.browserProfile != null ? <MaintenanceRow title="浏览器配置目录"><code>{installation.browserProfile}</code></MaintenanceRow> : null}
      {installation.prepared === true ? <><MaintenanceRow title="检查并修复连接程序" action={<CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'install-extension'} onClick={() => act('install-extension')}>检查并修复连接程序</CodexCuButton>} /><MaintenanceRow title="移除 Chrome 连接" action={<CodexCuButton color="danger" size="toolbar" disabled={blocked} loading={busy === 'remove-extension'} onClick={() => act('remove-extension')}>移除 Chrome 连接</CodexCuButton>}>移除连接会停止助手对 Chrome 的操控。网页和扩展目录保留，再次使用时重新准备连接。</MaintenanceRow></> : null}
    </MaintenanceSection> : null}
  </>;
}

function nativeDescription(native) {
  if (native.error) return <span role="alert">{native.error}</span>;
  if (native.supported === false) return '此系统版本尚不支持原生应用控制';
  if (native.installed == null) return '桌面控制安装状态未检测';
  if (!native.installed) return native.external ? '未找到指定的桌面程序' : 'Let ChatGPT control apps on your computer';
  if (native.repairRequired) return '桌面控制需要修复';
  if (native.updateAvailable) return '桌面控制有更新';
  if (native.restartRequired) return '桌面控制需要重启';
  if (native.platform === 'win32') return native.interactive === true && native.captureSupported === true ? 'Windows 桌面 · 前台操控' : 'Windows 桌面状态需要检查';
  if (native.accessibility === false || native.screenRecording === false) return '需要辅助功能与屏幕录制权限';
  if (!known(native.accessibility) || !known(native.screenRecording)) return '系统权限未检测';
  return 'Let ChatGPT control apps on your computer';
}

function extensionDescription(extension) {
  const installation = extension.installation;
  if (extension.error || installation?.error) return <span role="alert">{extension.error || installation.error}</span>;
  if (installation?.reloadRequired) return '待重新加载 Chrome 扩展';
  if (installation?.superseded) return 'Chrome 当前连接到另一套 Oh My DSH';
  if (extension.browsers?.length) return `${extension.browsers.map(browser => browser.name).join('、')} · 已连接`;
  if (installation?.preparing) return '正在准备 Chrome 连接…';
  if (installation?.prepared === true) return '连接程序已就绪 · 浏览器未连接';
  return '连接日常使用的浏览器';
}

export function ComputerSetup({ sessionId, visible, api }) {
  const [manage, setManage] = useState(null), [error, setError] = useState(''), [copied, setCopied] = useState('');
  const request = useCallback((input, signal) => api('setup', sessionId, input, signal), [api, sessionId]);
  const { state: setup, error: loadError, requestError, pendingInput, pending, act: run } = usePollingAction(request, 2500, visible);
  const busy = pendingInput?.action || '';
  const native = setup?.native, browser = setup?.browser, extension = setup?.extension, installation = extension?.installation;
  const blocked = pending || native?.installing || native?.removing || native?.screenLockInstallation?.busy || installation?.preparing;
  const act = action => { setError(''); return run({ action }); };
  const recheck = () => { setError(''); return run(undefined); };
  const copy = async (value, kind) => {
    if (typeof value !== 'string' || value === '') return;
    try { await navigator.clipboard.writeText(value); setCopied(kind); }
    catch (failure) { setError(failure.message); }
  };
  useEffect(() => { setManage(null); setCopied(''); setError(''); }, [sessionId]);
  useEffect(() => { if (!visible) setManage(null); }, [visible]);
  const managementAction = kind => <CodexCuButton color="secondary" size="toolbar" onClick={() => setManage(kind)}>{formatCodexCuMessage({id:'settings.computerUse.manage',defaultMessage:'Manage'})}</CodexCuButton>;
  const items = [];
  if (native) {
    const item = { id: localIds.native, title: 'Any App', description: nativeDescription(native), icon: <img alt="" className="codex-cu-settings-full-image" src={CodexComputerUsePluginIconUrl} />, showEnableToggle: false, action: managementAction('native') };
    if (native.supported === false) items.push({ ...item, kind: 'unavailable' });
    else if (known(native.installed) && !native.external) items.push({ ...item, plugin: { id: localIds.native, installed: native.installed, displayName: 'OpenCU 桌面控制' } });
    else items.push({ ...item, kind: 'app' });
  }
  if (browser) {
    const item = { id: localIds.browser, title: '内置浏览器', description: browser.error ? <span role="alert">{browser.error}</span> : `${browser.name ?? 'OpenCU 浏览器'} · ${browser.installed === true ? '独立工作配置' : browser.installed === false ? '待安装' : '安装状态未检测'}`, icon: <CodexCuIcon name="browser:t" />, showEnableToggle: false, action: managementAction('browser') };
    items.push(known(browser.installed) ? { ...item, plugin: { id: localIds.browser, installed: browser.installed, displayName: 'OpenCU 内置浏览器' } } : { ...item, kind: 'app' });
  }
  if (extension) {
    const canPrepare = installation?.supported === true && (installation.prepared === false || installation.prepared === true && (installation.updateAvailable || installation.superseded));
    items.push({ id: 'opencu-chrome-connection', kind: installation?.supported === false && !extension.browsers?.length ? 'unavailable' : 'app', title: 'Google Chrome', description: extensionDescription(extension), icon: <CodexCuBrowserControlIcon imageUrl={CodexCuBrowserLogoUrl('chrome')} />, showEnableToggle: false, action: <>{canPrepare ? <CodexCuButton color="secondary" size="toolbar" disabled={blocked} loading={busy === 'install-extension' || installation.preparing} onClick={() => act('install-extension')}>{installation.superseded ? '切换连接' : installation.updateAvailable ? '更新连接' : '准备连接'}</CodexCuButton> : null}{managementAction('extension')}</> });
  }
  const currentError = [error, requestError, loadError].filter(Boolean).filter((value, index, list) => list.indexOf(value) === index).join('；');
  if (setup && currentError) items.push({ id: 'opencu-setup-error', kind: 'app', showEnableToggle: false, title: 'OpenCU 操作未完成', description: <span role="alert">{currentError}</span>, action: <CodexCuButton color="secondary" size="toolbar" disabled={pending} onClick={recheck}>重新检查</CodexCuButton> });
  const onInstall = resource => resource.id === localIds.native ? act('install-native') : resource.id === localIds.browser ? act('install-browser') : undefined;
  const titles = { native: 'OpenCU · 桌面控制', browser: 'OpenCU · 内置浏览器', extension: 'OpenCU · Chrome 连接' };
  return <CodexCuScope className="tx-cu-setup tx-cu-setup-adapter" data-opencu-setup-source="setupStatus">
    <CodexCuSettings title={formatCodexCuMessage({id:'settings.computerUse.breadcrumb.computerUse',defaultMessage:'Computer use'})} control={{ items, isLoading: setup == null && !currentError, errorMessage: setup == null && currentError ? currentError : null, onRetry: recheck, pendingPluginId: busy === 'install-native' || native?.installing ? localIds.native : busy === 'install-browser' ? localIds.browser : null, onInstall: blocked ? undefined : onInstall, onOpenPluginDetails: resource => setManage(resource.id === localIds.native ? 'native' : 'browser') }} />
    <CodexCuDialog open={manage != null} onOpenChange={open => !open && setManage(null)} size="wide" contentOverflow="auto"><CodexCuDialogBody>
      <CodexCuDialogSection><CodexCuDialogHeader title={<CodexCuDialogTitle>{titles[manage]}</CodexCuDialogTitle>} subtitle={<CodexCuDialogDescription>OpenCU 本端安装与维护</CodexCuDialogDescription>} /></CodexCuDialogSection>
      <CodexCuDialogSection>
        {currentError ? <MaintenanceRow title="请求未完成" error action={<CodexCuButton color="secondary" size="toolbar" disabled={pending} onClick={recheck}>重新检查</CodexCuButton>}>{currentError}</MaintenanceRow> : null}
        {manage === 'native' ? <NativeMaintenance native={native} busy={busy} blocked={blocked} act={act} onClose={() => setManage(null)} /> : manage === 'browser' ? <BrowserMaintenance browser={browser} platform={installation?.platform} busy={busy} blocked={blocked} act={act} /> : manage === 'extension' ? <ExtensionMaintenance extension={extension} busy={busy} blocked={blocked} act={act} copied={copied} copy={copy} /> : null}
        {manage != null && !setup ? <CodexCuSettingsEmpty>正在检查运行环境…</CodexCuSettingsEmpty> : null}
      </CodexCuDialogSection>
    </CodexCuDialogBody></CodexCuDialog>
  </CodexCuScope>;
}
