import {ComputerIcon} from './computer-icons.jsx';
import React, { useEffect, useId, useState } from 'react';

function Permission({ title, detail, value }) {
  return <div className="tx-cu-setup-row"><div><strong>{title}</strong><p>{detail}</p></div><span className={value === true ? 'is-ready' : 'is-needed'}>{value === true ? '已开启' : value === false ? '待开启' : '未检测'}</span></div>;
}

function ChromeSetup({ extension, busy, act, onError }) {
  const [copied, setCopied] = useState('');
  const installation = extension?.installation, connected = !!extension?.browsers?.length;
  const copy = async (text, kind) => { try { await navigator.clipboard.writeText(text); setCopied(kind); } catch (error) { onError(error.message); } };
  return <>
    <div className="tx-cu-setup-row"><div><strong>Chrome 扩展</strong><p>{connected ? extension.browsers.map(browser => browser.name).join('、') + ' · 使用已有网页和登录状态' : '连接日常使用的浏览器'}</p></div><span className={connected && !installation?.reloadRequired ? 'is-ready' : 'is-needed'}>{installation?.reloadRequired ? '待重新加载' : connected ? '已连接' : installation?.prepared ? '连接程序已就绪' : '未连接'}</span></div>
    {extension?.error && <p className="tx-cu-error" role="alert">{extension.error}</p>}
    {installation?.supported ? <>
      {(!installation.prepared || installation.updateAvailable) && <div className="tx-cu-setup-install"><p>先准备本机连接程序，再在 Chrome 中加载扩展。开发版无需商店账号，首次加载需要开启 Chrome 的开发者模式。</p><button type="button" disabled={!!busy || installation.preparing} onClick={() => act('install-extension')}>{busy === 'install-extension' || installation.preparing ? '正在准备…' : installation.updateAvailable ? '更新 Chrome 连接' : '准备 Chrome 连接'}</button></div>}
      {installation.prepared && (!connected || installation.reloadRequired) && <div className="tx-cu-extension-steps">
        <p>{installation.reloadRequired ? '扩展文件已更新，请在 Chrome 扩展管理页重新加载 Trisoul Computer Use。' : '在 Chrome 地址栏打开 chrome://extensions，开启「开发者模式」，点击「加载已解压的扩展程序」，选择下面的目录。'}</p>
        <div className="tx-cu-setup-actions"><button type="button" onClick={() => copy('chrome://extensions', 'page')}>{copied === 'page' ? '已复制地址' : '复制扩展页地址'}</button><button type="button" onClick={() => copy(installation.extensionPath, 'folder')}>{copied === 'folder' ? '已复制目录' : '复制扩展目录'}</button></div>
        <code>{installation.extensionPath}</code><p className="tx-cu-muted">加载成功后会自动显示「已连接」。</p>
      </div>}
      <details className="tx-cu-setup-advanced"><summary>Chrome 连接详情</summary><p>扩展版本 {installation.version} · 本机连接程序{installation.prepared ? '已就绪' : '尚未准备'}</p><p>浏览器配置目录</p><code>{installation.browserProfile}</code>{installation.prepared && <button type="button" disabled={!!busy} onClick={() => act('install-extension')}>{busy === 'install-extension' ? '正在检查…' : '检查并修复连接程序'}</button>}</details>
    </> : !connected && <p className="tx-cu-muted">此平台的扩展安装程序尚未完成，内置浏览器可单独使用。</p>}
  </>;
}

export function ComputerSetup({ sessionId, visible, api }) {
  const panelId = useId();
  const [open, setOpen] = useState(false), [setup, setSetup] = useState(null), [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [busy, setBusy] = useState('');
  useEffect(() => {
    if (!open || !visible || !sessionId) return;
    let live = true, timer;
    const refresh = async () => {
      try { const next = await api('setup', sessionId); if (live) { setSetup(next); setLoadError(''); } }
      catch (e) { if (live) setLoadError(e.message); }
      if (live) timer = setTimeout(refresh, 2500);
    };
    void refresh(); return () => { live = false; clearTimeout(timer); };
  }, [open, visible, sessionId]);
  const act = async action => {
    setBusy(action); setError('');
    try { setSetup(await api('setup', sessionId, { action })); }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  };
  const native = setup?.native;
  return <section className="tx-cu-setup">
    <button className="tx-cu-setup-toggle" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}><span><ComputerIcon name="settings" size={14}/>运行环境与权限</span><ComputerIcon className="tx-cu-disclosure" name="chevron" size={12}/></button>
    {open && <div id={panelId}>
      {(error || loadError) && <p className="tx-cu-error" role="alert">{error || loadError}</p>}
      {!setup ? <p className="tx-cu-muted" role="status">正在检查运行环境…</p> : <>
        <div className="tx-cu-setup-row"><div><strong>内置浏览器</strong><p>{setup.browser.name} · 独立工作配置</p></div><span className={setup.browser.installed ? 'is-ready' : 'is-needed'}>{setup.browser.installed ? '已安装' : '待安装'}</span></div>
        {!setup.browser.installed && <p>请安装 Chrome，或在插件目录运行 <code>pnpm exec playwright install chromium</code>，然后重新打开浏览器。</p>}
        <details className="tx-cu-setup-advanced"><summary>浏览器详情</summary><p>网页登录保存在独立配置中。首次使用可能需要在 macOS 系统提示中允许浏览器访问钥匙串。</p><code>{setup.browser.path}</code></details>
        <ChromeSetup extension={setup.extension} busy={busy} act={act} onError={setError}/>
        {!native.supported ? <p className="tx-cu-muted">此平台的原生应用控制尚未实现。浏览器功能可单独使用。</p> : !native.installed ? <div className="tx-cu-setup-install"><strong>安装桌面控制</strong><p>安装 Trisoul Computer Use 后，可选择并操作 Mac 应用。当前开发版会在本机编译，需要 Apple Command Line Tools；发行版安装包尚未提供。</p><button type="button" disabled={!!busy || native.installing} onClick={() => act('install-native')}>{busy === 'install-native' || native.installing ? '正在编译并安装…' : '安装桌面控制'}</button></div> : <>
          {(native.updateAvailable||native.restartRequired)&&<div className="tx-cu-setup-install"><strong>{native.updateAvailable?'桌面控制有更新':'桌面控制需要重启'}</strong><p>会暂停当前桌面操作，完成后请重新选择应用。</p><button type="button" disabled={!!busy||native.installing} onClick={()=>act('install-native')}>{busy==='install-native'||native.installing?'正在更新桌面控制…':native.updateAvailable?'更新桌面控制':'重启桌面控制'}</button></div>}
          <Permission title="辅助功能" detail="读取应用控件并操作所选窗口" value={native.accessibility}/>
          <Permission title="屏幕录制" detail="向助手提供所选应用的画面" value={native.screenRecording}/>
          {native.error && <p className="tx-cu-error" role="alert">{native.error}</p>}
          <div className="tx-cu-setup-actions"><span className="tx-cu-muted">系统设置中的应用名称：Trisoul Computer Use</span><button type="button" disabled={!!busy} onClick={() => act('permissions')}>{busy === 'permissions' ? '正在打开…' : '打开权限设置'}</button></div>
          <details className="tx-cu-setup-advanced"><summary>桌面控制版本</summary><p>已安装 {native.version??'未知'}{native.runningVersion&&native.runningVersion!==native.version?` · 正在运行 ${native.runningVersion}`:''}</p></details>
        </>}
      </>}
    </div>}
  </section>;
}
