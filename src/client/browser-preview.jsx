import React, { useEffect, useRef, useState } from 'react';
import { AssistantCursor } from './assistant-cursor.jsx';
const releases = new Set(['release', 'pointerup', 'keyup']);

// Frames go straight to the pane; they do not become conversation attachments.
// Input is serialized, with only adjacent pointer moves coalesced. A press and
// its release always keep their order, including while the assistant stops.
export function BrowserPreview({ sessionId, tabId, visible, state, api, url, onState, onError, onNavigation, onBrowserShortcut, onFrame }) {
  const [frame, setFrame] = useState(null), [connection, setConnection] = useState('connecting');
  const [dialog, setDialog] = useState(null), [prompt, setPrompt] = useState('');
  const [reconnect, setReconnect] = useState(0);
  const [cursor, setCursor] = useState(null);
  const input = useRef(null), surface = useRef(null), current = useRef(null), queue = useRef([]), draining = useRef(false);
  const pressed = useRef(new Set()), keys = useRef(new Set()), composing = useRef(false);
  const lastPointer = useRef(null);
  const displayedData = useRef(null);
  const enabled = useRef(state?.enabled); enabled.current = state?.enabled;
  const callbacks = useRef({ onState, onError, onNavigation, onBrowserShortcut, onFrame }); callbacks.current = { onState, onError, onNavigation, onBrowserShortcut, onFrame };
  const stopLocalInput = () => { setCursor(null); queue.current = []; pressed.current.clear(); keys.current.clear(); input.current?.blur(); };

  useEffect(() => {
    if (current.current) current.current.stopped = state?.status === 'stopped';
    if (['stopped', 'stopping'].includes(state?.status)) setCursor(null);
  }, [state?.status]);
  useEffect(() => {
    const element = surface.current;
    const wheel = event => {
      event.preventDefault(); event.stopPropagation();
      if (!current.current?.id) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      send({ type: 'wheel', ...position(event), deltaX: Math.max(-10000, Math.min(10000, event.deltaX * unit)), deltaY: Math.max(-10000, Math.min(10000, event.deltaY * unit)) });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [sessionId, tabId, visible, state?.enabled, reconnect]);
  useEffect(() => {
    setFrame(null); setDialog(null); setCursor(null); current.current = null; displayedData.current = null;callbacks.current.onFrame?.(null);
    if (!visible) return;
    let active = true;
    const stream = new EventSource(url('stream', sessionId) + '&tab=' + encodeURIComponent(tabId));
    setConnection('connecting');
    stream.addEventListener('ready', event => { if (active) current.current = JSON.parse(event.data); });
    stream.addEventListener('frame', event => {
      if (!active) return;
      const next = JSON.parse(event.data);
      if (current.current) Object.assign(current.current, { actor: next.actor, controlEpoch: next.controlEpoch, stopped: next.stopped, transitioning: next.transitioning });
      // A reload can produce identical pixels. The browser won't fire img.load
      // for an unchanged src, but the new document identity must still advance.
      if (displayedData.current === next.data) {current.current = next;callbacks.current.onFrame?.(next);}
      setFrame(next); setConnection('live');
    });
    stream.addEventListener('control', event => {
      const next = JSON.parse(event.data);
      if (current.current && next.controlEpoch !== current.current.controlEpoch) stopLocalInput();
      if (current.current) Object.assign(current.current, next);
      if(current.current?.data)callbacks.current.onFrame?.({...current.current});
      if (next.stopped || next.transitioning) setCursor(null);
    });
    stream.addEventListener('cursor', event => {
      if (!active) return;
      const next = JSON.parse(event.data), observed = current.current;
      if (!next) { setCursor(null); return; }
      if (next.tabId === tabId && observed && next.controlEpoch === observed.controlEpoch && !observed.stopped && !observed.transitioning) setCursor(next);
    });
    stream.addEventListener('dialog', event => { const next = JSON.parse(event.data); setDialog(next); setPrompt(next?.defaultPrompt ?? ''); });
    stream.addEventListener('navigation', event => {
      const value = JSON.parse(event.data);
      setCursor(null);
      if (current.current?.loaderId && value.loaderId !== current.current.loaderId) { current.current.id = undefined; setConnection('connecting');callbacks.current.onFrame?.(null); }
      callbacks.current.onNavigation(value);
    });
    stream.addEventListener('warning', event => { callbacks.current.onError(JSON.parse(event.data).message); });
    stream.addEventListener('failure', event => { callbacks.current.onError(JSON.parse(event.data).message); setConnection('error'); stream.close(); stopLocalInput();callbacks.current.onFrame?.(null); });
    stream.addEventListener('closed', event => { const data=JSON.parse(event.data); if(!['target-changed','tab-closed'].includes(data.reason))callbacks.current.onError(data.message); setConnection('closed'); stream.close(); stopLocalInput(); current.current = null;callbacks.current.onFrame?.(null); });
    stream.onerror = () => { if (active) { setConnection('connecting'); stopLocalInput(); current.current = null;callbacks.current.onFrame?.(null); } };
    return () => { active = false; stream.close(); stopLocalInput(); current.current = null;callbacks.current.onFrame?.(null); };
  }, [sessionId, tabId, visible, state?.enabled, reconnect]);

  const drain = async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      while (queue.current.length) {
        const item = queue.current.shift();
        try {
          const next = await api('input', sessionId, item);
          if (current.current?.actor === item.actor && current.current.controlEpoch === item.controlEpoch) {
            current.current.stopped = next.status === 'stopped'; callbacks.current.onState(next);
          }
        } catch (error) {
          // Do not discard new-controller events when an old request settles.
          queue.current = queue.current.filter(q => q.actor !== item.actor || q.controlEpoch !== item.controlEpoch || releases.has(q.type));
          if (current.current?.actor === item.actor && current.current.controlEpoch === item.controlEpoch) {
            pressed.current.clear(); keys.current.clear(); callbacks.current.onError(error.message);
            if (!releases.has(item.type)) queue.current.push({ ...item, type: 'release' });
          }
        }
      }
    } finally { draining.current = false; }
  };
  const send = value => {
    if (enabled.current === false && value.type !== 'dialog' && !releases.has(value.type)) return;
    const observed = current.current;
    if (observed?.transitioning && value.type !== 'dialog') return;
    if (!observed?.actor || (!observed.id && !['release', 'dialog'].includes(value.type))) return;
    const item = { ...value, actor: observed.actor, tabId, frameId: observed.id, controlEpoch: observed.controlEpoch };
    if (!releases.has(value.type)) setCursor(null);
    const last = queue.current.at(-1);
    if (item.type === 'pointermove' && last?.type === item.type && last.actor === item.actor && last.controlEpoch === item.controlEpoch) queue.current[queue.current.length - 1] = item;
    else queue.current.push(item);
    void drain();
  };
  const release = () => {
    if (pressed.current.size || keys.current.size) send({ type: 'release' });
    pressed.current.clear(); keys.current.clear();
  };
  const position = event => {
    const rect = surface.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const modifiers = event => {
    for (const [key, flag] of [['Meta','metaKey'],['Control','ctrlKey'],['Alt','altKey'],['Shift','shiftKey']]) {
      if (event[flag] && !keys.current.has(key)) { keys.current.add(key); send({ type: 'keydown', key }); }
      if (!event[flag] && keys.current.delete(key)) send({ type: 'keyup', key });
    }
  };
  const keyDown = event => {
    event.stopPropagation();
    if (event.isComposing || composing.current || event.key === 'Process' || event.key === 'Dead') return;
    const shortcut = (event.metaKey || event.ctrlKey) && ({ l: 'focus', t: 'new', w: 'close', r: 'reload', '[': 'back', ']': 'forward' })[event.key.toLowerCase()];
    if (shortcut) { event.preventDefault(); release(); callbacks.current.onBrowserShortcut(shortcut); return; }
    // Let the hidden input receive the system clipboard and IME. Printable
    // characters are forwarded by onInput, preserving composed Unicode text.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') return;
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) return;
    event.preventDefault(); modifiers(event);
    if (!['Meta','Control','Alt','Shift'].includes(event.key)) { keys.current.add(event.key); send({ type: 'keydown', key: event.key }); }
  };
  const keyUp = event => {
    event.stopPropagation();
    if (keys.current.delete(event.key)) { event.preventDefault(); send({ type: 'keyup', key: event.key }); }
    modifiers(event);
  };
  const insert = text => { if (text) send({ type: 'text', text }); if (input.current) input.current.value = ''; };

  return <div className="tx-cu-live" aria-label="浏览器实时画面">
    <div className="tx-cu-live-meta"><span className={connection === 'live' ? 'tx-cu-live-dot' : ''}>{connection === 'live' ? '实时画面' : connection === 'connecting' ? '正在连接画面…' : '画面已断开'}</span><span>{state?.status === 'stopped' ? '你可以操作' : '点击画面接管'}</span></div>
    <div className="tx-cu-live-surface" ref={surface} onContextMenu={e => e.preventDefault()}
      onPointerDown={e => {
        if (connection !== 'live' || dialog) return;
        e.preventDefault(); e.stopPropagation(); input.current?.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId); modifiers(e); pressed.current.add(e.button);
        lastPointer.current = position(e);
        send({ type: 'pointerdown', ...lastPointer.current, button: e.button, clickCount: Math.min(3, Math.max(1, e.detail)) });
      }}
      onPointerMove={e => { if (!dialog && (pressed.current.size || current.current?.stopped)) { lastPointer.current = position(e); send({ type: 'pointermove', ...lastPointer.current }); } }}
      onPointerUp={e => {
        if (!pressed.current.has(e.button)) return;
        e.preventDefault(); const next = position(e);
        if (!dialog && (next.x !== lastPointer.current?.x || next.y !== lastPointer.current?.y)) send({ type: 'pointermove', ...next });
        send({ type: 'pointerup', button: e.button }); pressed.current.delete(e.button);
        if (!pressed.current.size && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onLostPointerCapture={release} onPointerCancel={release}>
      {frame ? <img src={'data:' + frame.mediaType + ';base64,' + frame.data} alt="当前浏览器页面；点击可接管操作" draggable={false} onLoad={()=>{displayedData.current=frame.data;if(current.current?.actor===frame.actor){current.current={...frame,controlEpoch:current.current.controlEpoch,stopped:current.current.stopped,transitioning:current.current.transitioning};callbacks.current.onFrame?.(frame);}}}/> : <div className="tx-cu-live-placeholder">正在获取页面…</div>}
      {visible && enabled.current && connection === 'live' && !dialog && !frame?.browserCursor && <AssistantCursor cursor={cursor} frame={frame}/>}
      <textarea ref={input} className="tx-cu-keyboard" aria-label="浏览器键盘输入" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onBlur={release} onKeyDown={keyDown} onKeyUp={keyUp}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={e => { composing.current = false; insert(e.currentTarget.value); }}
        onInput={e => { if (!composing.current) insert(e.currentTarget.value); }}
        onPaste={e => { e.preventDefault(); e.stopPropagation(); insert(e.clipboardData.getData('text/plain')); }}/>
      {connection !== 'live' && frame && <div className="tx-cu-live-overlay">{connection === 'connecting' ? '连接中，稍后可继续操作' : '画面已断开'}</div>}
    </div>
    {['closed','error'].includes(connection) && <button className="tx-cu-reconnect" onClick={()=>{callbacks.current.onError('');setReconnect(n=>n+1);}}>重连画面</button>}
    {dialog && <form className="tx-cu-dialog" onSubmit={e => { e.preventDefault(); send({ type: 'dialog', dialogId: dialog.id, accept: true, text: prompt }); }}><strong>{dialog.type === 'prompt' ? '网页请求输入' : '网页提示'}</strong><p>{dialog.message}</p>{dialog.type === 'prompt' && <input aria-label="网页提示输入" value={prompt} onChange={e => setPrompt(e.target.value)}/>}<div>{dialog.type !== 'alert' && <button type="button" onClick={() => send({ type: 'dialog', dialogId: dialog.id, accept: false })}>取消</button>}<button className="tx-cu-primary">确定</button></div></form>}
  </div>;
}
