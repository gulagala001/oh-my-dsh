import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {DndContext, PointerSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors} from '@dnd-kit/core';
import {CodexCuButton} from './codex-cu-primitives.jsx';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {formatCodexCuMessage} from './codex-cu-i18n.mjs';
import {browserTabTransferInput, canTransferBrowserTab, CODEX_BROWSER_TAB_DRAG_DISTANCE,
  isBrowserTabNewWindowDrop, isDetachedBrowserResult} from './codex-browser-tab-transfer.mjs';
import {CodexBrowserTabNativePreview} from './codex-browser-tab-transfer-preview.mjs';
import placeholderCss from './codex-browser-tab-transfer.css';

const TransferContext = createContext(null);
// Exact zh-CN-b05cfd55c534.js entries for the newly connected source tab body.
const translated = {
  'appShell.tabs.detachedDescription': ['This tab is open in a separate window', '此标签页已在单独窗口中打开'],
  'appShell.tabs.restoreToTab': ['Restore tab', '恢复到标签页'],
  'appShell.tabs.showDetachedWindow': ['Show window', '显示窗口'],
  'appShell.tabs.windowRestoreFailed': ['Couldn\'t restore this tab', '无法恢复此标签页'],
  'appShell.tabs.windowMoveFailed': ['Couldn\'t open this tab in a new window', '无法在新窗口中打开此标签页'],
  'appShell.tabs.dragNewWindowCue': ['Release to open in a new window', '松开，然后在新窗口中打开'],
};
const message = (id, defaultMessage) => translated[id]?.[0] === defaultMessage
  ? translated[id][1] : formatCodexCuMessage({id, defaultMessage});

// Observe actual sensor coordinates through its public SensorProps callbacks,
// keeping dnd-kit's pointer lifecycle and the source's mouse-only transfer.
class BrowserTabPointerSensor extends PointerSensor {
  constructor(props) {
    super({...props,
      onStart: point => {props.options.onCoordinates(point); props.onStart(point);},
      onMove: point => {props.options.onCoordinates(point); props.onMove(point);},
    });
  }
  static activators = PointerSensor.activators.map(activator => ({...activator,
    handler: (event, options, context) => event.nativeEvent.pointerType === 'mouse'
      && activator.handler(event, options, context),
  }));
}

function releasePointer(drag) {
  try {if (drag?.node.hasPointerCapture(drag.pointerId)) drag.node.releasePointerCapture(drag.pointerId);} catch {}
}

export function CodexBrowserTabTransfer({sessionId, state, disabled = false, api, onState, onError, children}) {
  const rows = useMemo(() => new Map(), [sessionId]), drag = useRef(null), point = useRef(null), request = useRef(null);
  const live = useRef(null), generation = useRef(0), [revision, setRevision] = useState(0), [pending, setPending] = useState(false);
  const nativePreviews = useRef(new Set());
  const [confirmed, setConfirmed] = useState(new Map());
  live.current = {sessionId, state, disabled, onState, onError};
  const cleanupPreview = useCallback(preview => {
    if (!preview) return Promise.resolve();
    return preview.dispose().then(() => {nativePreviews.current.delete(preview);}, error => {
      if (live.current.sessionId === preview.sessionId) live.current.onError?.(error.message);
    });
  }, []);
  const clear = useCallback((dispose = true) => {
    const owned = drag.current; drag.current = null; point.current = null; releasePointer(owned);
    if (dispose !== false) void cleanupPreview(owned?.preview);
  }, [cleanupPreview]);
  const cancel = useCallback(() => {clear(); setRevision(value => value + 1);}, [clear]);
  useEffect(() => {
    generation.current++;
    setPending(false); setConfirmed(new Map());
    return () => {
      generation.current++; request.current?.abort(); request.current = null; clear(); rows.clear();
      for (const preview of nativePreviews.current) void cleanupPreview(preview);
    };
  }, [sessionId, clear, rows, cleanupPreview]);
  useEffect(() => {if (drag.current && (disabled || drag.current.controlEpoch !== state?.controlEpoch)) cancel();}, [disabled, state?.controlEpoch, cancel]);
  useEffect(() => {
    const target = state?.viewTarget ?? state?.target;
    if (target?.kind === 'tab' && !target.detached) setConfirmed(previous => {
      const id = target.browserId + ':' + target.id, receipt = previous.get(id);
      if (!receipt || !(state.observedAt > receipt.observedAt)) return previous;
      const next = new Map(previous); next.delete(id); return next;
    });
  }, [state?.observedAt, state?.viewTarget, state?.target]);
  const coordinates = useCallback(value => {point.current = value;}, []);
  const sensors = useSensors(useSensor(BrowserTabPointerSensor, {
    activationConstraint: {distance: CODEX_BROWSER_TAB_DRAG_DISTANCE}, onCoordinates: coordinates,
  }));
  const registerRow = useCallback((id, node) => {if (node) rows.set(id, node); else rows.delete(id);}, [rows]);
  const recordPointerUp = useCallback(event => {
    if (event.pointerId === drag.current?.pointerId) point.current = {x: event.clientX, y: event.clientY};
  }, []);
  const lostPointer = useCallback(event => {if (event.pointerId === drag.current?.pointerId) cancel();}, [cancel]);
  const start = useCallback(event => {
    const current = live.current, data = event.active.data.current, native = event.activatorEvent;
    const node = data?.getNode();
    if (!current.sessionId || current.disabled || request.current || !canTransferBrowserTab(data?.tab)
        || native?.pointerType !== 'mouse' || !native.isPrimary || native.button !== 0 || !node?.isConnected) return cancel();
    try {node.setPointerCapture(native.pointerId);} catch {return cancel();}
    drag.current = {tab: {...data.tab}, sessionId: current.sessionId, controlEpoch: current.state?.controlEpoch,
      pointerId: native.pointerId, node};
    const rect = node.getBoundingClientRect();
    try {
      const preview = new CodexBrowserTabNativePreview({api, sessionId: current.sessionId, tab: data.tab,
        controlEpoch: current.state?.controlEpoch, node,
        grabOffset: {x: native.clientX - rect.left, y: native.clientY - rect.top}, getPoint: () => point.current,
        getRows: () => [...rows.values()].filter(node => node.isConnected).map(node => node.getBoundingClientRect()),
        cueLabel: message('appShell.tabs.dragNewWindowCue', 'Release to open in a new window'),
        onCleanupError: error => {if (live.current.sessionId === current.sessionId) live.current.onError?.(error.message);}});
      nativePreviews.current.add(preview); drag.current.preview = preview;
    } catch {}
  }, [api, cancel, rows]);
  const end = useCallback(event => {
    const owned = drag.current, current = live.current, finalPoint = point.current;
    const rects = [...rows.values()].filter(node => node.isConnected).map(node => node.getBoundingClientRect());
    clear(false);
    if (!owned || current.disabled || current.sessionId !== owned.sessionId
        || current.state?.controlEpoch !== owned.controlEpoch
        || !owned.node.isConnected
        || !isBrowserTabNewWindowDrop(finalPoint, event.over, rects, {width: window.innerWidth, height: window.innerHeight})) {
      void cleanupPreview(owned?.preview); return;
    }
    const controller = new AbortController(), stamp = generation.current;
    request.current = controller; setPending(true);
    const isCurrent = () => generation.current === stamp && !controller.signal.aborted && request.current === controller
      && live.current.sessionId === owned.sessionId;
    void Promise.resolve().then(async () => {
      await owned.preview?.freezeAtDrop();
      if (!isCurrent() || live.current.state?.controlEpoch !== owned.controlEpoch) return;
      return api('transfer-tab', owned.sessionId, browserTabTransferInput(owned.tab, owned.controlEpoch), controller.signal);
    }).then(result => {
      if (!isCurrent()) return;
      if (!result) return;
      if (result.state?.status) live.current.onState?.(result.state);
      if (!isDetachedBrowserResult(result.result)) throw new Error(message('appShell.tabs.windowMoveFailed', 'Couldn\'t open this tab in a new window'));
      setConfirmed(previous => new Map(previous).set(owned.tab.browserId + ':' + owned.tab.id,
        {detachedId: result.result.id, seen: false, observedAt: result.state?.observedAt}));
    }).catch(error => {if (isCurrent()) live.current.onError?.(error.message);}).finally(async () => {
      await cleanupPreview(owned.preview);
      if (isCurrent()) {request.current = null; setPending(false);}
    });
  }, [api, clear, rows, cleanupPreview]);
  const observeListed = useCallback((id, tab) => setConfirmed(previous => {
    const receipt = previous.get(id);
    if (!receipt) return previous;
    if (tab.detached?.id === receipt.detachedId && !receipt.seen) {
      return new Map(previous).set(id, {...receipt, seen: true});
    }
    if ((receipt.seen || tab.observedAt > receipt.observedAt) && tab.canTransfer === true && !tab.detached) {
      const next = new Map(previous); next.delete(id); return next;
    }
    return previous;
  }), []);
  const context = useMemo(() => ({disabled: disabled || pending, confirmed, observeListed, registerRow, recordPointerUp, lostPointer}), [disabled, pending, confirmed, observeListed, registerRow, recordPointerUp, lostPointer]);
  return <TransferContext.Provider value={context}><DndContext key={sessionId + ':' + revision} sensors={sensors}
    collisionDetection={pointerWithin} onDragStart={start} onDragCancel={clear} onDragAbort={clear} onDragEnd={end}>
    {children}
  </DndContext></TransferContext.Provider>;
}

export function CodexBrowserTransferTab({tab, listedTab, disabled, children}) {
  const transfer = useContext(TransferContext);
  return transfer ? <TransferTab tab={tab} listedTab={listedTab} disabled={disabled} transfer={transfer}>{children}</TransferTab>
    : children({rowRef: undefined, buttonRef: undefined, attributes: {}, listeners: {}});
}

export function CodexBrowserTransferStrip({children}) {
  const transfer = useContext(TransferContext);
  return transfer ? <TransferStrip>{children}</TransferStrip> : children(undefined);
}

function TransferStrip({children}) {
  const transfer = useContext(TransferContext);
  const strip = useDroppable({id: 'opencu-browser-tab-strip'});
  const stripRef = useCallback(node => {strip.setNodeRef(node); transfer.registerRow('opencu-browser-tab-strip', node);}, [strip.setNodeRef, transfer.registerRow]);
  return children(stripRef);
}

function TransferTab({tab, listedTab, disabled, transfer, children}) {
  const button = useRef(null), id = tab.browserId + ':' + tab.id;
  const receipt = transfer.confirmed.get(id);
  useEffect(() => {if (listedTab) transfer.observeListed(id, listedTab);}, [id, listedTab, receipt, transfer.observeListed]);
  const draggable = useDraggable({id, disabled: disabled || transfer.disabled || Boolean(receipt) || !canTransferBrowserTab(tab), data: {tab, getNode: () => button.current}});
  const droppable = useDroppable({id});
  const rowRef = useCallback(node => {droppable.setNodeRef(node); transfer.registerRow(id, node);}, [droppable.setNodeRef, transfer.registerRow, id]);
  const buttonRef = useCallback(node => {button.current = node; draggable.setNodeRef(node); draggable.setActivatorNodeRef(node);}, [draggable.setNodeRef, draggable.setActivatorNodeRef]);
  return children({rowRef, buttonRef, attributes: draggable.attributes,
    listeners: {...draggable.listeners, onPointerUpCapture: transfer.recordPointerUp,
      onLostPointerCapture: transfer.lostPointer}});
}

const styleOwners = new WeakMap();
export function CodexBrowserDetachedTab({sessionId, target, state, api, onState, onError}) {
  const [pending, setPending] = useState(null), operation = useRef(null), generation = useRef(0), live = useRef(null);
  live.current = {sessionId, target, state, onState, onError};
  useEffect(() => {
    generation.current++; setPending(null);
    return () => {generation.current++; operation.current?.abort(); operation.current = null;};
  }, [sessionId, target?.id, target?.detached?.id]);
  useEffect(() => {
    let owner = styleOwners.get(document);
    if (!owner) {const element = document.createElement('style'); element.textContent = placeholderCss; document.head.append(element); owner = {element, count: 0}; styleOwners.set(document, owner);}
    owner.count++;
    return () => {if (--owner.count === 0) {owner.element.remove(); styleOwners.delete(document);}};
  }, []);
  const act = async action => {
    if (operation.current) return;
    const current = live.current, stamp = generation.current, controller = new AbortController();
    operation.current = controller; setPending(action);
    const isCurrent = () => generation.current === stamp && !controller.signal.aborted && operation.current === controller;
    try {
      const result = await api('transfer-tab', current.sessionId, browserTabTransferInput(current.target, current.state?.controlEpoch, action), controller.signal);
      if (!isCurrent()) return;
      if (result.state?.status) live.current.onState?.(result.state);
      if (action === 'restore' && !['moved', 'closed'].includes(result.result)) {
        throw new Error(message('appShell.tabs.windowRestoreFailed', 'Couldn\'t restore this tab'));
      }
      if (action === 'focus' && result.result !== true) throw new Error('未能显示独立浏览器窗口');
    } catch (error) {if (isCurrent()) live.current.onError?.(error.message);}
    finally {if (isCurrent()) {operation.current = null; setPending(null);}}
  };
  return <div className="codex-cu-detached-tab-placeholder" data-browser-detached-tab={target.id}>
    <div className="codex-cu-detached-tab-placeholder-content">
      <span className="codex-cu-detached-tab-placeholder-icon"><CodexCuIcon name="shared:Dtt" size={16}/></span>
      <div className="codex-cu-detached-tab-placeholder-text"><div className="codex-cu-detached-tab-placeholder-title">{target.title}</div>
        <div className="codex-cu-detached-tab-placeholder-description">{message('appShell.tabs.detachedDescription', 'This tab is open in a separate window')}</div></div>
      <div className="codex-cu-detached-tab-placeholder-actions">
        <CodexCuButton color="primary" loading={pending === 'restore'} disabled={pending !== null} onClick={() => void act('restore')}>{message('appShell.tabs.restoreToTab', 'Restore tab')}</CodexCuButton>
        <CodexCuButton color="secondary" disabled={pending !== null} onClick={() => void act('focus')}>{message('appShell.tabs.showDetachedWindow', 'Show window')}</CodexCuButton>
      </div>
    </div>
  </div>;
}
