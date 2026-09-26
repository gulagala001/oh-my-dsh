import React, { useEffect, useId, useRef, useState } from 'react';
import { recommendedPlugins } from './recommended-plugins.mjs';
import { createPoller } from './polling.mjs';

async function pluginApi(input, signal) {
  const response = await fetch('trisoul-x/recommended-plugins', input === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  if (response.status === 404) throw Error('插件管理尚未加载，请重启 DSH 后重试');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
  return data;
}

function PluginIcon({ kind = 'plugin', size = 20 }) {
  const paths = {
    plugin: 'M9 3H4v6h2a3 3 0 1 1 0 6H4v6h6v-2a3 3 0 1 1 6 0v2h5v-6h-2a3 3 0 1 1 0-6h2V3h-6v2a3 3 0 1 1-6 0V3Z',
    search: 'm20 20-5-5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    arrow: 'M14 4h6v6M20 4 10 14M10 4H4v16h16v-6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}

export function RecommendedPlugins({ plugins = recommendedPlugins }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState('');
  const [state, setState] = useState(null), [error, setError] = useState(''), [requestError, setRequestError] = useState(''), [pending, setPending] = useState(false);
  const poller = useRef(null), alive = useRef(false), writing = useRef(false);
  useEffect(() => {
    alive.current = true;
    const observer = createPoller({ read: signal => pluginApi(undefined, signal), onData: data => { setState(data); setError(''); }, onError: e => setError(e.message), interval: 2000 });
    poller.current = observer; observer.start();
    return () => { alive.current = false; observer.stop(); };
  }, []);
  const act = async input => {
    if (writing.current) return;
    writing.current = true; setPending(true); setRequestError(''); poller.current.stop();
    try { const data = await pluginApi(input); if (alive.current) setState(data); }
    catch (e) { if (alive.current) setRequestError(e.message); }
    finally { writing.current = false; if (alive.current) { setPending(false); poller.current.start(); } }
  };
  const headingId = useId();
  const categories = [...new Set(plugins.map(plugin => plugin.category).filter(Boolean))];
  const selected = categories.includes(category) ? category : '';
  const search = query.trim().toLocaleLowerCase();
  const matches = plugins.filter(plugin => (!selected || plugin.category === selected)
    && [plugin.name, plugin.author, plugin.description, plugin.category].join(' ').toLocaleLowerCase().includes(search));
  const clear = () => { setQuery(''); setCategory(''); };

  return <section className="tx-app tx-recommended" aria-labelledby={headingId}>
    <header className="tx-recommended-heading">
      <div><h2 id={headingId}>推荐插件</h2><p>发现值得尝试的第三方插件，拓展 Oh My DSH 的使用方式。</p></div>
      <div className="tx-recommended-heading-actions">{plugins.length > 0 && <span className="tx-badge">{plugins.length} 个推荐</span>}<a className="tx-button" href="https://github.com/gulagala001/oh-my-dsh/issues/new?template=plugin-submission.yml" target="_blank" rel="noopener noreferrer">提交插件 / 申请适配<PluginIcon kind="arrow" size={13}/></a></div>
    </header>
    <p className="tx-recommended-submit-hint">只需仓库地址和一句用途，自己的插件或推荐他人的开源插件都可以。AI 按需批量检查，维护者确认后收录。</p>
    <div className="tx-recommended-auto"><div><strong>自动更新推荐插件</strong><p>默认关闭。开启后，DSH 运行期间每 6 小时在会话空闲时检查，只更新已安装、启用且已核验的推荐插件，固定到核验版本。需要重启时会提示。</p>{state?.checkedAt && <small>上次自动检查：{new Date(state.checkedAt).toLocaleString()}</small>}</div><input type="checkbox" role="switch" aria-label="自动更新推荐插件" checked={state?.autoUpdate === true} disabled={!state || pending || !!error} onChange={event => void act({ action: 'settings', autoUpdate: event.target.checked })}/></div>
    {error && <div className="tx-alert tx-alert-error" role="alert">{error}<button type="button" className="tx-button tx-quiet" disabled={pending} onClick={() => void poller.current.refresh()}>重新读取</button></div>}
    {requestError && <div className="tx-alert tx-alert-error" role="alert">{requestError}</div>}
    {plugins.length > 0 ? <>
      <div className="tx-recommended-toolbar">
        <label className="tx-recommended-search"><PluginIcon kind="search" size={16}/><input type="search" aria-label="搜索推荐插件" placeholder="搜索插件、作者或功能" value={query} onChange={event => setQuery(event.target.value)}/></label>
        {categories.length > 1 && <select aria-label="插件分类" value={selected} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>}
      </div>
      <p className="tx-recommended-count" role="status">{matches.length} 个插件{selected ? ` · ${selected}` : ''}</p>
      {matches.length > 0 ? <div className="tx-recommended-grid">{matches.map(plugin => { const installed = state?.plugins.find(item => item.id === plugin.id), busy = state?.busy?.id === plugin.id ? state.busy : null;
        return <article className="tx-recommended-card" key={plugin.id}>
        <div className="tx-recommended-card-head"><span className="tx-recommended-icon"><PluginIcon/></span><div><h4>{plugin.name}</h4><p>{plugin.author}</p></div></div>
        <p className="tx-recommended-description">{plugin.description}</p>
        <p className="tx-recommended-review">{plugin.review ? `已核验 v${plugin.review.version} · ${plugin.review.platforms.join(' / ')} · DSH ${plugin.review.dsh} · OMD ${plugin.review.omd}` : '社区推荐 · 兼容性待核验'}{plugin.review?.note && <span>{plugin.review.note}</span>}</p>
        {plugin.review && installed?.installed && installed.version !== plugin.review.version && <p className="tx-recommended-result tx-warn">当前安装版本未在此组合核验。旧版可点“更新”；更高版本不会自动降级。</p>}
        <p className="tx-recommended-version">{plugin.manualInstall ? '需按项目说明配置' : !installed ? '正在读取安装状态…' : installed.installed ? `${installed.enabled ? '已安装' : '已安装 · 未启用'}${installed.version ? ' · v' + installed.version : ''}` : '未安装'}{installed?.restartRequired && <span className="tx-badge tx-warn">待重启</span>}</p>
        {plugin.manualInstall ? <p className="tx-recommended-result">{plugin.manualInstall}</p> : <div className="tx-recommended-actions">{installed?.installed ? <><button type="button" className="tx-button tx-primary" disabled={pending || !!state?.busy || !!error} onClick={() => void act({ id: plugin.id, action: 'update' })}>{busy?.action === 'update' ? (busy.automatic ? '自动更新中…' : '更新中…') : '更新'}</button><button type="button" className="tx-button" disabled={pending || !!state?.busy || !!error || !installed.removable} onClick={() => void act({ id: plugin.id, action: 'uninstall' })}>{busy?.action === 'uninstall' ? '卸载中…' : '卸载'}</button></> : <button type="button" className="tx-button tx-primary" disabled={!installed || pending || !!state?.busy || !!error} onClick={() => void act({ id: plugin.id, action: 'install' })}>{busy?.action === 'install' ? '安装中…' : '安装'}</button>}</div>}
        {(installed?.error || installed?.message) && <p className={installed.error ? 'tx-recommended-result tx-error' : 'tx-recommended-result'} role={installed.error ? 'alert' : 'status'}>{installed.error || installed.message}</p>}
        <footer>{plugin.category && <span className="tx-badge">{plugin.category}</span>}<a className="tx-recommended-link" href={plugin.url} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${plugin.name} 项目（新窗口）`}>查看项目<PluginIcon kind="arrow" size={13}/></a></footer>
      </article>; })}</div> : <div className="tx-recommended-empty"><span className="tx-recommended-empty-icon"><PluginIcon kind="search" size={26}/></span><h4>没有找到匹配的插件</h4><p>试试其他关键词，或查看全部推荐。</p><button type="button" className="tx-button" onClick={clear}>清除筛选</button></div>}
    </> : <div className="tx-recommended-empty"><span className="tx-recommended-empty-icon"><PluginIcon size={28}/></span><h4>推荐清单正在整理</h4><p>这里将展示精选的第三方插件。<br/>你可以在这里了解插件用途、作者，并前往项目页面。</p><span className="tx-recommended-coming">敬请期待</span></div>}
  </section>;
}

export function applyRecommendedPlugins(ctx) {
  ctx.slots.inject('settings.section', () => {
    let remove, alive = true, revision = 0;
    const controller = new AbortController();
    const update = config => {
      if (!alive) return;
      if (config.recommendedPluginsPageEnabled !== false) {
        remove ??= ctx.slots.register({ name: 'settings.section', id: 'trisoul-x-recommended', order: 17, label: () => '推荐插件' }, RecommendedPlugins);
      } else { remove?.(); remove = undefined; }
    };
    const saved = event => { revision++; update(event.detail); };
    window.addEventListener('omd:settings-saved', saved);
    const ticket = revision;
    void fetch('trisoul-x/api/settings', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const config = await response.json();
      if (revision === ticket) update(config);
    }).catch(() => { if (revision === ticket) update({}); });
    return () => {
      alive = false; controller.abort();
      window.removeEventListener('omd:settings-saved', saved); remove?.();
    };
  });
}
