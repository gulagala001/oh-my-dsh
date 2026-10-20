import React, { useId, useState } from 'react';
import { Icon } from './native-icons.jsx';
import { Button, Input, Switch } from './native-controls.jsx';
import { recommendedPlugins } from './recommended-plugins.mjs';
import { usePollingAction } from './use-polling-action.mjs';
import { createPoller } from './polling.mjs';

async function pluginApi(input, signal) {
  const request = async signal => {
    const response = await fetch('trisoul-x/recommended-plugins', input === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
    if (response.status === 404) throw Error('插件管理尚未加载，请重启 DSH 后重试');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
    signal?.throwIfAborted();
    window.dispatchEvent(new CustomEvent('omd:features-state', { detail: data }));
    return data;
  };
  if (input === undefined) return request(signal);
  const controller = new AbortController();
  let timeout;
  try {
    // Writes stop polling. Bound the HTTP acknowledgement, including its body,
    // so an accepted operation can still be observed after a lost response.
    return await Promise.race([request(controller.signal), new Promise((_, reject) => {
      timeout = setTimeout(() => {
        const error = Error('请求超时，正在重新读取插件状态，请确认当前状态后重试');
        reject(error); controller.abort(error);
      }, 10000);
    })]);
  } finally { clearTimeout(timeout); }
}

const operationLabel = { enable: '正在开启…', disable: '正在关闭…', install: '正在安装…', update: '正在更新…', uninstall: '正在卸载…' };

// Bundled client contributions follow the host's actual runtime entry. A
// standalone installation retains its own lease when OMD releases this one.
export function applyFeatureClients(ctx, clients) {
  ctx.effect(() => {
    let alive = true, revision = 0, queued = Promise.resolve();
    const fibers = new Map();
    const sync = snapshot => {
      const ticket = ++revision;
      queued = queued.catch(() => {}).then(async () => {
        if (!alive || ticket !== revision) return;
        for (const [id, apply] of Object.entries(clients)) {
          const entry = snapshot.plugins?.find(plugin => plugin.id === id);
          if (!entry) continue;
          if (entry.active && !fibers.has(id)) {
            const fiber = ctx.plugin({ name: `omd-feature-${id}`, apply });
            fibers.set(id, fiber);
            try { await fiber; } catch (error) { fibers.delete(id); await fiber.dispose(); throw error; }
          } else if (!entry.active && fibers.has(id)) {
            const fiber = fibers.get(id); fibers.delete(id); await fiber.dispose();
          }
        }
      }).catch(error => { if (alive) console.error('扩展功能界面加载失败', error); });
    };
    const changed = event => sync(event.detail);
    window.addEventListener('omd:features-state', changed);
    const poller = createPoller({ read: signal => pluginApi(undefined, signal), onData: () => {}, onError: () => {}, interval: 10000 });
    poller.start();
    return () => {
      alive = false; revision++; poller.stop(); window.removeEventListener('omd:features-state', changed);
      return queued.then(() => Promise.all([...fibers.values()].map(fiber => fiber.dispose())));
    };
  });
}

export function FeatureSettings({ section = 'features', plugins = recommendedPlugins }) {
  const [query, setQuery] = useState('');
  const { state, error, requestError, pending, pendingInput, act, refresh } = usePollingAction(pluginApi, 2000);
  const headingId = useId();
  const thirdParty = section === 'third-party';
  const entries = plugins.filter(plugin => (plugin.section === 'features') !== thirdParty);
  const search = query.trim().toLocaleLowerCase();
  const matches = entries.filter(plugin => [plugin.name, plugin.author, plugin.description, plugin.category].join(' ').toLocaleLowerCase().includes(search));
  const locked = pending || !!state?.busy || !!error;

  return <section className="tx-app tx-feature-settings" aria-labelledby={headingId}>
    <header className="tx-feature-heading"><h3 id={headingId}>{thirdParty ? '第三方功能' : '扩展功能'}</h3><p>开关立即保存；首次开启自动安装，关闭后保留配置与数据。</p></header>
    {error && <div className="tx-alert tx-alert-error" role="alert">{error}<Button size="sm" variant="outline" type="button" disabled={pending} onClick={() => void refresh()}>重新读取</Button></div>}
    {requestError && <p className="tx-feature-result tx-error" role="alert">{requestError}</p>}
    {thirdParty && <Input className="omd-native-search" icon={<Icon name="search" size={16}/>} type="search" aria-label="搜索第三方功能" placeholder="搜索功能或作者" value={query} onChange={event => setQuery(event.target.value)}/>}
    <div className="tx-feature-list">{matches.map(plugin => {
      const installed = state?.plugins.find(item => item.id === plugin.id);
      const operation = state?.busy?.id === plugin.id ? state.busy : pendingInput?.id === plugin.id ? pendingInput : null;
      const unavailable = installed && Object.hasOwn(installed, 'unavailable') ? installed.unavailable : plugin.unavailable;
      const cannotEnable = !installed?.installed && (unavailable || plugin.manualInstall);
      const disabled = !installed || locked || installed.readOnly || !!cannotEnable;
      const result = operation ? operationLabel[operation.action] : installed?.error || (installed?.restartRequired ? '重启 DSH 后生效' : installed?.message);
      return <div className="tx-feature-row" key={plugin.id} aria-busy={!!operation}>
        <div className="tx-feature-main"><div className="tx-feature-copy"><strong>{plugin.name}</strong><p>{plugin.description}</p></div>
          <Switch label={plugin.name} checked={installed?.enabled === true} disabled={!!disabled} onChange={enabled => void act({ id: plugin.id, action: enabled ? 'enable' : 'disable' })}/>
        </div>
        {!installed && !error && <p className="tx-feature-result" role="status">正在读取状态…</p>}
        {result && <p className={`tx-feature-result${installed?.error && !operation ? ' tx-error' : ''}`} role={installed?.error && !operation ? 'alert' : 'status'}>{result}</p>}
        {(cannotEnable || installed?.readOnly) && <p className="tx-feature-result">{installed?.readOnly ? '此功能由宿主配置管理。' : '暂时无法自动安装，请查看详情。'}</p>}
        <details className="tx-feature-details"><summary>详情</summary><div>
          <p>{plugin.author}{installed?.version ? ` · v${installed.version}` : ''}{plugin.bundled ? ' · 已内置' : installed?.installed ? ' · 已安装' : ''}</p>
          {(unavailable || plugin.manualInstall) && <p>{unavailable || plugin.manualInstall}</p>}
          {installed?.needsBuildSwitch && <p>当前安装包面向其他宿主，请更新为匹配版本。</p>}
          <div className="tx-feature-actions">
            {installed?.installed && !plugin.bundled && <>
              <Button type="button" size="sm" variant="ghost" disabled={!!unavailable || locked || installed.readOnly} onClick={() => void act({ id: plugin.id, action: 'update' })}>检查更新</Button>
              <Button type="button" size="sm" variant="ghost" disabled={locked || !installed.removable} onClick={() => void act({ id: plugin.id, action: 'uninstall' })}>卸载</Button>
            </>}
            {installed?.enabled && installed.error && <Button type="button" size="sm" variant="ghost" disabled={locked || installed.readOnly} onClick={() => void act({ id: plugin.id, action: 'enable' })}>重试开启</Button>}
            {plugin.bundled && installed?.enabled && <Button type="button" size="sm" variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('deepseek-workbench:open', { detail: { page: 'chat' } }))}>打开工作台</Button>}
            <a href={plugin.url} target="_blank" rel="noopener noreferrer">{plugin.bundled ? '使用说明' : '项目主页'}<Icon name="external" size={12}/></a>
            {plugin.upstream && <a href={plugin.upstream.url} target="_blank" rel="noopener noreferrer">原作者项目<Icon name="external" size={12}/></a>}
          </div>
        </div></details>
      </div>;
    })}</div>
    {matches.length === 0 && <p className="tx-feature-empty">{search ? '没有找到匹配的功能。' : '暂无可用功能。'}</p>}
    {thirdParty && <>
      <div className="tx-feature-row"><div className="tx-feature-main"><div className="tx-feature-copy"><strong>自动更新扩展功能</strong><p>空闲时检查已安装并开启的功能，仅使用已核验版本。需要重启时会提示。</p></div><Switch label="自动更新扩展功能" checked={state?.autoUpdate === true} disabled={!state || locked} onChange={value => void act({ action: 'settings', autoUpdate: value })}/></div></div>
      <a className="tx-feature-submit" href="https://github.com/gulagala001/oh-my-dsh/issues/new?template=plugin-submission.yml" target="_blank" rel="noopener noreferrer">推荐其他功能<Icon name="external" size={12}/></a>
    </>}
  </section>;
}
