import React, { useEffect, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { createPoller } from './polling.mjs';
import css from './startup.css';

const recovery = '完整退出 DSH 并备份当前 profile，按原安装来源重新安装失败的依赖，再重启。lockfile-only 不会补回磁盘上的缺失文件。';
const details = (error, depth = 0) => depth > 5 ? '' : [error?.stack || error?.message || String(error),
  ...(error?.cause ? ['Caused by: ' + details(error.cause, depth + 1)] : []),
  ...(Array.isArray(error?.errors) ? error.errors.map(cause => details(cause, depth + 1)) : []),
].join('\n');

export function applyStartupNotice(ctx) {
  const listeners = new Set(), failures = new Map();
  let active = true;
  const report = (name, error) => {
    if (!active) return;
    const row = { name, message: error?.message ?? String(error), details: details(error) }, previous = failures.get(name);
    if (previous?.message === row.message && previous.details === row.details) return;
    failures.set(name, row);
    console.error('Oh My DSH: ' + name, error);
    for (const listener of listeners) listener([...failures.values()]);
  };
  function Notice() {
    const [rows, setRows] = useState([...failures.values()]), [dismissed, setDismissed] = useState(false);
    useEffect(() => { const changed = value => { setRows(value); setDismissed(false); }; listeners.add(changed); changed([...failures.values()]); return () => listeners.delete(changed); }, []);
    if (!rows.length || dismissed) return null;
    return <aside className="omd-startup-notice" role="alert" aria-label="Oh My DSH 启动诊断">
      <strong>部分增强功能未启动，基础会话界面可用</strong>
      <Button type="button" variant="ghost" size="sm" onClick={() => setDismissed(true)}>关闭提示</Button>
      {rows.map(row => <details key={row.name}><summary>{row.name}：{row.message}</summary><pre>{row.details}</pre></details>)}
      <p>{recovery} 需要继续聊天时，可选择其他可用的 Agent 预设。</p>
      <a href="https://github.com/gulagala001/oh-my-dsh/blob/main/docs/troubleshooting.md#native-dependencies" target="_blank" rel="noreferrer">依赖修复指引</a>
    </aside>;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'omd-startup', order: 1000 }, Notice));
  ctx.effect(() => {
    const style = document.createElement('style'); style.textContent = css; style.dataset.plugin = 'omd-startup';
    document.head.append(style);
    const poller = createPoller({
      read: async signal => {
        const response = await fetch('oh-my-dsh/startup', { signal, cache: 'no-store' });
        if (!response.ok) throw Error(`启动诊断读取失败（HTTP ${response.status}）`);
        return response.json();
      },
      onData: state => {
        failures.delete('启动诊断');
        if (state.status === 'error') report('OMD 后端', state.error);
        else for (const listener of listeners) listener([...failures.values()]);
        if (state.status !== 'loading') poller.stop();
      },
      onError: error => report('启动诊断', error), interval: 2000,
    });
    poller.start();
    return () => { active = false; poller.stop(); style.remove(); listeners.clear(); };
  });
  return report;
}
