import React, { useEffect, useState } from 'react';
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './plugin-preflight.css';

export function applyPluginPreflight(ctx) {
  let snapshot = { active: false };
  const listeners = new Set();
  function Notice() {
    const [state, setState] = useState(snapshot), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    useEffect(() => { listeners.add(setState); setState(snapshot); return () => listeners.delete(setState); }, []);
    useEffect(() => { setBusy(false); setMessage(''); }, [state.id, state.phase]);
    async function decide(choice) {
      if (busy || state.phase !== 'decision') return;
      setBusy(true); setMessage('');
      try {
        const response = await fetch('oh-my-dsh/plugin-preflight', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: state.id, choice }), signal: AbortSignal.timeout(10000) });
        const value = await response.json();
        if (!response.ok) throw Error(value.error || `HTTP ${response.status}`);
      } catch (error) { setMessage(error.message); }
      finally { setBusy(false); }
    }
    async function copy() {
      try { await navigator.clipboard.writeText(state.repair || ''); setMessage('已复制 AI 修复信息'); }
      catch { setMessage('复制失败，可展开下方修复信息手动复制'); }
    }
    if (!state.active) return null;
    if (state.phase !== 'decision') return <aside className="omd-preflight-progress" role="status" aria-live="polite">
      <span>{state.phase || '正在进行安装预检'}</span>
    </aside>;
    return <Modal open title={state.failure?.kind === 'unavailable' ? '插件预检未完成' : '插件未通过安装预检'} closeLabel="取消安装"
      onClose={() => { void decide('cancel'); }} className="omd-preflight-dialog"
      description={state.failure?.kind === 'unavailable' ? '检测环境未完成验证，不能据此判定插件不兼容。' : '隔离环境未通过启动或基础界面检查。'}
      footer={<><Button type="button" variant="ghost" disabled={busy} onClick={() => void decide('cancel')} data-modal-autofocus>取消安装</Button>
        <Button type="button" variant="outline" onClick={() => void copy()}>复制 AI 修复信息</Button>
        <Button type="button" variant="primary" disabled={busy || state.canContinue === false} onClick={() => void decide('continue')}>仍然安装</Button></>}>
      <p className="omd-preflight-target">{state.target}</p><p>{state.failure?.message}</p>
      <small>仍然安装仅跳过这次预检，宿主原有的版本检查和安装规则继续生效。</small>
      <details><summary>查看 AI 修复信息</summary><pre tabIndex={0}>{state.repair}</pre></details>
      {message && <p role="status">{message}</p>}
    </Modal>;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'omd-plugin-preflight', order: 900 }, Notice));
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; style.dataset.plugin = 'omd-plugin-preflight'; document.head.append(style);
    const source = new EventSource('oh-my-dsh/plugin-preflight/events');
    source.onmessage = event => {
      try { snapshot = JSON.parse(event.data); for (const listener of listeners) listener(snapshot); } catch {}
    };
    return () => { source.close(); style.remove(); listeners.clear(); };
  });
}
