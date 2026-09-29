import React from 'react';
import { usePollingAction } from '#opencu/src/client/use-polling-action.mjs';

async function updateApi(version, signal) {
  const response = await fetch('trisoul-x/api/version-update', version === undefined ? { signal, cache: 'no-store' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version }) });
  if (response.status === 404) throw Error('更新服务尚未加载，请重启 DSH 后重试。');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `更新请求失败（HTTP ${response.status}）`);
  if (!['idle', 'checking', 'installing', 'applying', 'restart-required', 'failed'].includes(data.phase)) throw Error('无法读取更新状态，请稍后重试。');
  return data;
}

export function VersionUpdate({ version, stale }) {
  const { state, error, requestError, pending, act } = usePollingAction(updateApi, 1500);
  const installing = pending || ['checking', 'installing', 'applying'].includes(state?.phase);
  const restart = state?.phase === 'restart-required';
  const progress = state?.phase === 'checking' ? '正在确认更新版本…' : state?.phase === 'applying' ? '正在保存安装配置…' : '正在下载并安装更新…';
  const desktop = window.location.protocol === 'dsh-app:';
  if (!version && !installing && !restart && state?.phase !== 'failed') return null;
  return <div className="omd-version-update">
    {restart ? <p className="omd-version-update-result" role="status"><strong>更新已安装 · 待重启</strong><br/>已安装 {state.targetVersion}。{desktop
      ? '请使用应用菜单中的“重启应用与 Host”，或完整退出应用后重新打开。'
      : '请按原方式重启 DSH 服务，再刷新页面。'}重启后“当前版本”才会改变。</p>
      : <>
        {version && <button type="button" className="omd-version-install" disabled={!state?.available || !!error || stale || installing}
          onClick={() => void act(version)}>{installing ? '更新中…' : state?.phase === 'failed' || requestError ? '重试更新' : '更新'}</button>}
        <p className="omd-version-update-hint" role={installing ? 'status' : undefined}>{installing ? progress
          : stale ? '请先重新检查更新，确认最新发布信息。' : state?.blockedReason || (version ? `安装 ${version}，重启 DSH 后生效。` : '')}</p>
      </>}
    {(error || requestError || state?.error) && <p className="omd-version-error" role="alert">{error || requestError || state.error}</p>}
  </div>;
}
