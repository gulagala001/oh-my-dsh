import React, { useEffect, useState } from 'react';
import { CodexCuMenuItem } from './codex-cu-primitives.jsx';
import { ComputerIcon } from './computer-icons.jsx';
import { browserTabTransferInput, canTransferBrowserTab, isDetachedBrowserResult } from './codex-browser-tab-transfer.mjs';

const changed = message => Object.assign(new Error(message), { code: 'BROWSER_WORKSPACE_TRANSFER_CHANGED' });
const fields = ['browserEpoch', 'providerTabId', 'title', 'url'];
const sameDisplayedTab = (displayed, current) => fields.every(key => displayed[key] === current[key])
  && displayed.detached?.id === current.detached?.id;

/** Install content actions only on OpenCU's own real-browser resource records. */
export function installBrowserWorkspaceTransferMenu(ctx, { kind, workspace, api, onState, onError }) {
  const operations = new Map();
  let disposed = false;
  const report = (error, sessionId) => {
    if (typeof onError === 'function') {
      try { onError(error, sessionId); }
      catch (reportError) { console.error('OpenCU browser transfer error reporting failed:', error, reportError); }
    }
    else console.error('OpenCU browser window transfer failed:', error);
  };
  const sourceCurrent = (sessionId, hostTab) => !disposed && ctx.sidebarRight.mounted.getSnapshot() === sessionId
    && ctx.sidebarRight.tabsIn(sessionId).some(tab => tab.id === hostTab.id && tab.kind === kind && tab.contentId === hostTab.contentId);

  async function read(sessionId, hostTab, signal) {
    const identity = workspace.parse(hostTab.contentId);
    if (identity.sessionId !== sessionId || !sourceCurrent(sessionId, hostTab)) throw changed('浏览器页签所属会话已改变。');
    const [inventory, state] = await Promise.all([
      api('tabs', sessionId, undefined, signal), api('state', sessionId, undefined, signal),
    ]);
    signal.throwIfAborted();
    if (!sourceCurrent(sessionId, hostTab)) throw changed('浏览器页签所属会话已改变。');
    if (!Array.isArray(inventory?.tabs) || !Array.isArray(inventory.successfulBrowserIds)
      || !inventory.successfulBrowserIds.includes(identity.browserId)) {
      throw changed('真实浏览器页签清单尚未读取完成。');
    }
    const matches = inventory.tabs.filter(tab => tab.id === identity.tabId && tab.browserId === identity.browserId);
    if (matches.length !== 1 || matches[0].available !== true) throw changed('浏览器页签已关闭或由其他会话控制。');
    const target = matches[0];
    if (!Number.isSafeInteger(state?.controlEpoch) || state.controlEpoch < 0 || state.enabled === false
      || state.transitioning || state.resuming) throw changed('浏览器控制权正在切换，请稍后重试。');
    if (target.detached && !isDetachedBrowserResult(target.detached)) throw changed('独立浏览器窗口身份尚未确认。');
    if (!target.detached && !canTransferBrowserTab(target)) throw changed('这个浏览器不支持真实独立窗口转移。');
    return { identity, inventory, state, target };
  }

  function act(sessionId, hostTab, displayed, action, dismiss) {
    if (operations.has(hostTab.contentId) || !sourceCurrent(sessionId, hostTab)) return;
    const controller = new AbortController(), operation = { controller, promise: null };
    operations.set(hostTab.contentId, operation);
    dismiss();
    // The menu disappears on selection; its plugin lifetime, not the menu body, owns the request.
    operation.promise = Promise.resolve().then(async () => {
      const signal = controller.signal, current = await read(sessionId, hostTab, signal);
      if (!sameDisplayedTab(displayed, current.target)) throw changed('页签地址或窗口身份已改变，请重新打开页签菜单。');
      if (action === 'detach' && current.target.detached || action !== 'detach' && !current.target.detached) {
        throw changed('页签的独立窗口状态已改变。');
      }
      const input = browserTabTransferInput(current.target, current.state.controlEpoch, action);
      const receipt = await api('transfer-tab', sessionId, input, signal);
      signal.throwIfAborted();
      if (action === 'detach' && !isDetachedBrowserResult(receipt?.result)) throw changed('原生浏览器没有确认新的独立窗口。');
      if (action === 'focus' && receipt?.result !== true) throw changed('原生浏览器没有确认窗口已显示。');
      if (action === 'restore' && !['moved', 'closed'].includes(receipt?.result)) throw changed('原生浏览器没有确认页签已恢复。');
      if (receipt?.state?.status) onState?.(receipt.state, sessionId);
      if (!sourceCurrent(sessionId, hostTab)) return;
      const inventory = await api('tabs', sessionId, undefined, signal);
      signal.throwIfAborted();
      if (!sourceCurrent(sessionId, hostTab)) return;
      if (!Array.isArray(inventory?.tabs) || !Array.isArray(inventory.successfulBrowserIds)
        || !inventory.successfulBrowserIds.includes(current.identity.browserId)) {
        throw changed('窗口已处理，但真实页签状态尚未同步。');
      }
      const target = inventory.tabs.find(tab => tab.id === current.identity.tabId && tab.browserId === current.identity.browserId);
      if (target && (target.available !== true || target.browserEpoch !== current.target.browserEpoch)) {
        throw changed('窗口处理后浏览器归属或连接已改变。');
      }
      if (action === 'detach' && (!target || target.detached?.id !== receipt.result.id)) throw changed('新窗口回执尚未与真实页签状态对齐。');
      if (action === 'restore' && receipt.result === 'moved' && (!target || target.detached)) throw changed('恢复回执尚未与真实页签状态对齐。');
      if (action === 'restore' && receipt.result === 'closed' && target?.detached) throw changed('窗口关闭回执尚未与真实页签状态对齐。');
      workspace.sync(sessionId, inventory.tabs, { inventorySucceeded: true, successfulBrowserIds: inventory.successfulBrowserIds });
      if (action === 'restore' && target && !target.detached) workspace.reveal(sessionId, target, { hostTabId: hostTab.id });
    }).catch(error => {
      if (!controller.signal.aborted && !disposed) report(error, sessionId);
    }).finally(() => {
      if (operations.get(hostTab.contentId) === operation) operations.delete(hostTab.contentId);
    });
  }

  function OwnMenu({ sessionId, tab, dismiss }) {
    const [snapshot, setSnapshot] = useState(null), [error, setError] = useState('');
    useEffect(() => {
      const controller = new AbortController();
      setSnapshot(null); setError('');
      void read(sessionId, tab, controller.signal).then(setSnapshot).catch(failure => {
        if (!controller.signal.aborted) setError(failure.message);
      });
      return () => controller.abort();
    }, [sessionId, tab.id, tab.contentId]);
    const item = (action, label) => {
      const activate = event => {
        if (event.nativeEvent?.isTrusted !== true) return;
        act(sessionId, tab, snapshot.target, action, dismiss);
      };
      return <CodexCuMenuItem key={action} leftIcon={<ComputerIcon name="browser" size={16}/>} onSelect={activate}
        disabled={operations.has(tab.contentId)} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
        }}>{label}</CodexCuMenuItem>;
    };
    if (!snapshot) return <CodexCuMenuItem disabled>{error || '正在读取真实窗口状态…'}</CodexCuMenuItem>;
    return snapshot.target.detached
      ? <>{item('focus', '显示窗口')}{item('restore', '恢复到标签页')}</>
      : item('detach', '在独立窗口中打开');
  }

  function TransferMenu(props) {
    if (props.tab?.kind !== kind) return null;
    return <OwnMenu {...props}/>;
  }
  ctx.slots.inject('sidebar.right.tab.menu.item', () => ctx.slots.register({
    name: 'sidebar.right.tab.menu.item', id: 'opencu-browser-workspace-window-transfer', order: 25,
  }, TransferMenu));
  ctx.effect(() => () => {
    disposed = true;
    for (const operation of operations.values()) operation.controller.abort();
    return Promise.allSettled([...operations.values()].map(operation => operation.promise));
  });
}
