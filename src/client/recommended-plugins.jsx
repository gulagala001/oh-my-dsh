import React, { useId, useState } from 'react';
import { recommendedPlugins } from './recommended-plugins.mjs';
import { usePollingAction } from './use-polling-action.mjs';
import { createPoller } from './polling.mjs';

async function pluginApi(input, signal) {
  const request = async signal => {
    const response = await fetch('trisoul-x/recommended-plugins', input === undefined ? { signal } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
    if (response.status === 404) throw Error('插件管理尚未加载，请重启 DSH 后重试');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || `HTTP ${response.status}`);
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
  const { state, error, requestError, pending, act, refresh } = usePollingAction(pluginApi, 2000);
  const headingId = useId();
  const categories = [...new Set(plugins.map(plugin => plugin.category).filter(Boolean))];
  const selected = categories.includes(category) ? category : '';
  const search = query.trim().toLocaleLowerCase();
  const matches = plugins.filter(plugin => (!selected || plugin.category === selected)
    && [plugin.name, plugin.author, plugin.description, plugin.category].join(' ').toLocaleLowerCase().includes(search));
  const clear = () => { setQuery(''); setCategory(''); };

  return <section className="tx-app tx-recommended" aria-labelledby={headingId}>
    <header className="tx-recommended-heading">
      <div><h2 id={headingId}>推荐插件</h2><p>查看内置工作台与值得尝试的第三方插件，拓展 Oh My DSH 的使用方式。</p></div>
      <div className="tx-recommended-heading-actions">{plugins.length > 0 && <span className="tx-badge">{plugins.length} 个推荐</span>}<a className="tx-button" href="https://github.com/gulagala001/oh-my-dsh/issues/new?template=plugin-submission.yml" target="_blank" rel="noopener noreferrer">提交插件 / 申请适配<PluginIcon kind="arrow" size={13}/></a></div>
    </header>
    <p className="tx-recommended-submit-hint">只需仓库地址和一句用途，自己的插件或推荐他人的开源插件都可以。AI 按需批量检查，维护者确认后收录。</p>
    <div className="tx-recommended-auto"><div><strong>自动更新推荐插件</strong><p>默认关闭。开启后，DSH 运行期间每 6 小时在会话空闲时检查，只更新已安装、启用且已核验的发行包，固定到核验版本；源码快照需手动更新，内置工作台随 OMD 更新。需要重启时会提示。</p>{state?.checkedAt && <small>上次自动检查：{new Date(state.checkedAt).toLocaleString()}</small>}</div><input type="checkbox" role="switch" aria-label="自动更新推荐插件" checked={state?.autoUpdate === true} disabled={!state || pending || !!error} onChange={event => void act({ action: 'settings', autoUpdate: event.target.checked })}/></div>
    {error && <div className="tx-alert tx-alert-error" role="alert">{error}<button type="button" className="tx-button tx-quiet" disabled={pending} onClick={() => void refresh()}>重新读取</button></div>}
    {requestError && <div className="tx-alert tx-alert-error" role="alert">{requestError}</div>}
    {plugins.length > 0 ? <>
      <div className="tx-recommended-toolbar">
        <label className="tx-recommended-search"><PluginIcon kind="search" size={16}/><input type="search" aria-label="搜索推荐插件" placeholder="搜索插件、作者或功能" value={query} onChange={event => setQuery(event.target.value)}/></label>
        {categories.length > 1 && <select aria-label="插件分类" value={selected} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}</select>}
      </div>
      <p className="tx-recommended-count" role="status">{matches.length} 个插件{selected ? ` · ${selected}` : ''}</p>
      {matches.length > 0 ? <div className="tx-recommended-grid">{matches.map(plugin => { const installed = state?.plugins.find(item => item.id === plugin.id), busy = state?.busy?.id === plugin.id ? state.busy : null;
        const review = plugin.bundled ? null : installed && Object.hasOwn(installed, 'review') ? installed.review : plugin.review;
        const unavailable = installed && Object.hasOwn(installed, 'unavailable') ? installed.unavailable : plugin.unavailable;
        return <article className="tx-recommended-card" key={plugin.id}>
        <div className="tx-recommended-card-head"><span className="tx-recommended-icon"><PluginIcon/></span><div><h4>{plugin.name}</h4><p>{plugin.author}</p></div></div>
        <p className="tx-recommended-description">{plugin.description}</p>
        <p className="tx-recommended-review">{plugin.bundled ? '随 OMD 内置，版本随 OMD 更新；具体宿主能力与未验证项见使用说明。' : review ? `${review.wholeProductAccepted === false ? '已绑定本地构建（未验收）' : review.source ? '已核验源码' : '已核验'} v${review.version}${review.source ? ' · ' + review.source.commit.slice(0, 7) : ''} · ${review.platforms.join(' / ')} · ${(review.combinations ?? [review]).map(pair => 'DSH ' + pair.dsh + (pair.omd ? ' · OMD ' + pair.omd : '')).join(' / ')}` : '社区推荐 · 兼容性待核验'}{review?.note && <span>{review.note}</span>}</p>
        {review && installed?.installed && installed.version !== review.version && <p className="tx-recommended-result tx-warn">当前安装版本与目录固定构建不同。{unavailable ? '安装与更新暂未开放；已有安装和数据将保留。' : '旧版可点“更新”；更高版本不会自动降级。'}</p>}
        {unavailable && <p className="tx-recommended-result tx-warn">{unavailable}</p>}
        <p className="tx-recommended-version">{plugin.bundled ? !installed ? '正在读取启用状态…' : `${installed.enabled ? '已内置·默认启用' : '已内置·未启用'}${installed.version ? ' · v' + installed.version : ''}` : plugin.manualInstall ? '需按项目说明配置' : !installed ? '正在读取安装状态…' : installed.installed ? `${installed.enabled ? '已安装' : '已安装 · 未启用'}${installed.version ? ' · v' + installed.version : ''}` : '未安装'}{installed?.restartRequired && <span className="tx-badge tx-warn">待重启</span>}</p>
        {plugin.bundled ? <div className="tx-recommended-actions">{[['chat', '打开网页聊天'], ['platform', '打开账号页 / 开放平台']].map(([page, label]) => <button key={page} type="button" className={`tx-button${page === 'chat' ? ' tx-primary' : ''}`} disabled={!installed?.enabled || !!error} onClick={() => window.dispatchEvent(new CustomEvent('deepseek-workbench:open', { detail: { page } }))}>{label}</button>)}</div> : plugin.manualInstall ? <p className="tx-recommended-result">{plugin.manualInstall}</p> : <div className="tx-recommended-actions">{installed?.installed ? <><button type="button" className="tx-button tx-primary" disabled={!!unavailable || pending || !!state?.busy || !!error} onClick={() => void act({ id: plugin.id, action: 'update' })}>{busy?.action === 'update' ? (busy.automatic ? '自动更新中…' : '更新中…') : '更新'}</button><button type="button" className="tx-button" disabled={pending || !!state?.busy || !!error || !installed.removable} onClick={() => void act({ id: plugin.id, action: 'uninstall' })}>{busy?.action === 'uninstall' ? '卸载中…' : '卸载'}</button></> : <button type="button" className="tx-button tx-primary" disabled={!!unavailable || !installed || pending || !!state?.busy || !!error} onClick={() => void act({ id: plugin.id, action: 'install' })}>{busy?.action === 'install' ? '安装中…' : '安装'}</button>}</div>}
        {(installed?.error || installed?.message) && <p className={installed.error ? 'tx-recommended-result tx-error' : 'tx-recommended-result'} role={installed.error ? 'alert' : 'status'}>{installed.error || installed.message}</p>}
        <footer>{plugin.category && <span className="tx-badge">{plugin.category}</span>}{plugin.upstream && <a className="tx-recommended-link" href={plugin.upstream.url} target="_blank" rel="noopener noreferrer" aria-label={`查看原作 ${plugin.upstream.name}（新窗口）`}>原作者项目<PluginIcon kind="arrow" size={13}/></a>}<a className="tx-recommended-link" href={plugin.url} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${plugin.name} ${plugin.bundled ? '使用说明' : '项目'}（新窗口）`}>{plugin.bundled ? '使用说明' : '查看项目'}<PluginIcon kind="arrow" size={13}/></a></footer>
      </article>; })}</div> : <div className="tx-recommended-empty"><span className="tx-recommended-empty-icon"><PluginIcon kind="search" size={26}/></span><h4>没有找到匹配的插件</h4><p>试试其他关键词，或查看全部推荐。</p><button type="button" className="tx-button" onClick={clear}>清除筛选</button></div>}
    </> : <div className="tx-recommended-empty"><span className="tx-recommended-empty-icon"><PluginIcon size={28}/></span><h4>推荐清单正在整理</h4><p>这里将展示精选的第三方插件。<br/>你可以在这里了解插件用途、作者，并前往项目页面。</p><span className="tx-recommended-coming">敬请期待</span></div>}
  </section>;
}

export function applyRecommendedPlugins(ctx) {
  ctx.slots.inject('settings.section', () => {
    let remove, alive = true, revision = 0;
    const update = config => {
      if (!alive) return;
      if (config.recommendedPluginsPageEnabled !== false) {
        remove ??= ctx.slots.register({ name: 'settings.section', id: 'trisoul-x-recommended', order: 17, label: () => '推荐插件' }, RecommendedPlugins);
      } else { remove?.(); remove = undefined; }
    };
    const ticket = revision;
    const complete = config => {
      initialRead.stop();
      if (alive && revision === ticket) update(config);
    };
    const initialRead = createPoller({
      read: async signal => {
        const response = await fetch('trisoul-x/api/settings', { signal });
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        return response.json();
      },
      onData: complete, onError: () => complete({}), timeout: 10000,
    });
    const saved = event => { revision++; initialRead.stop(); update(event.detail); };
    window.addEventListener('omd:settings-saved', saved);
    initialRead.start();
    return () => {
      alive = false; initialRead.stop();
      window.removeEventListener('omd:settings-saved', saved); remove?.();
    };
  });
}
