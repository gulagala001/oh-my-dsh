import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {CodexCuScope} from './codex-cu-scope.jsx';
import {CodexAppshotAttachmentRow, createCodexAppshotAction} from './codex-window-share.jsx';
import {decorateSlotComponent} from './slot-decoration.mjs';

// Conversation keeps ownership of every File, object URL, upload and draft id.
// This metadata follows its browser File objects without altering that contract.
const draftContexts = new WeakMap();

export function getWindowShareDraftContext(attachment) {
  return attachment?.file ? draftContexts.get(attachment.file) : undefined;
}

function captureImageContext(attachment, sessionId) {
  if (attachment?.kind !== 'image' || typeof attachment.id !== 'string' || !attachment.id) return undefined;
  const context = getWindowShareDraftContext(attachment);
  return context?.imageId === attachment.id && context.sessionId === sessionId ? context : undefined;
}

function currentWindow(windows) {
  const active = windows.filter(window => window?.active === true);
  if (active.length !== 1) return {
    window: null,
    gap: {
      code: active.length ? 'ambiguous-active-window' : 'no-active-window',
      activeCount: active.length,
      detail: 'The backend must identify one active window before Appshot capture can be offered.',
    },
  };
  const window = active[0];
  if (!Number.isSafeInteger(window.pid) || window.pid <= 0 ||
      !Number.isSafeInteger(window.window_id) || window.window_id <= 0 ||
      typeof window.process_identity !== 'string' || !window.process_identity.length) {
    return {window: null, gap: {code: 'invalid-active-window', activeCount: 1, detail: 'The active window lacks a valid native capture identity.'}};
  }
  return {window, gap: null};
}

async function post(sessionId, operation, value, signal) {
  const response = await fetch('trisoul-x/computer-use/' + operation + '?session=' + encodeURIComponent(sessionId), {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(value), signal,
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || '窗口分享失败'), {code: body.code});
  return body;
}

/** Controlled current-app action. Refresh when the host opens its context menu. */
export function useWindowShareAction({
  sessionId, inputActions, conversation, disabled = false, formatMessage,
  onCaptured, onError,
}) {
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gap, setGap] = useState(null);
  const [pendingCapture, setPendingCapture] = useState(null);
  const request = useRef(null);
  const operation = useRef(null);
  const generation = useRef(0);
  const liveSession = useRef(sessionId);
  liveSession.current = sessionId;
  const canUse = Boolean(sessionId && !disabled &&
    typeof inputActions?.addAttachments === 'function' &&
    typeof conversation?.createDrafts === 'function' &&
    typeof conversation?.releaseDraftAttachments === 'function');
  const binding = useRef({mounted: false});
  const targetSession = useRef(null);
  const selectedTarget = useRef(null);
  const selectedGap = useRef(null);
  Object.assign(binding.current, {sessionId, inputActions, conversation, canUse});
  const currentBinding = useCallback(() => binding.current.mounted && binding.current.canUse &&
    binding.current.sessionId === sessionId && binding.current.inputActions === inputActions &&
    binding.current.conversation === conversation, [sessionId, inputActions, conversation]);

  useEffect(() => {
    generation.current++;
    binding.current.mounted = true;
    targetSession.current = null;
    selectedTarget.current = null;
    selectedGap.current = null;
    setTarget(null); setBusy(false); setError(''); setGap(null); setPendingCapture(null);
    operation.current = null;
    return () => {
      generation.current++;
      binding.current.mounted = false;
      targetSession.current = null;
      selectedTarget.current = null;
      selectedGap.current = null;
      request.current?.abort();
      request.current = null;
      operation.current = null;
    };
  }, [sessionId, canUse, inputActions, conversation]);

  const fail = useCallback(value => {
    const detail = value?.message || '窗口分享失败';
    setError(detail);
    onError?.(value);
  }, [onError]);

  const cancel = useCallback(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    operation.current = null;
    targetSession.current = null;
    selectedTarget.current = null;
    selectedGap.current = null;
  }, []);

  const refresh = useCallback(async () => {
    if (!canUse || !currentBinding() || operation.current === 'capture') return null;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    operation.current = 'refresh';
    const stamp = generation.current;
    const current = () => currentBinding() && !controller.signal.aborted && liveSession.current === sessionId && generation.current === stamp && request.current === controller;
    targetSession.current = null;
    selectedTarget.current = null;
    selectedGap.current = null;
    setTarget(null); setGap(null); setError(''); setBusy(true);
    try {
      const result = await post(sessionId, 'share-windows', {}, controller.signal);
      if (!current()) return null;
      const selected = currentWindow(Array.isArray(result.windows) ? result.windows : []);
      targetSession.current = selected.window ? sessionId : null;
      selectedTarget.current = selected.window;
      selectedGap.current = selected.gap;
      setTarget(selected.window); setGap(selected.gap);
      return selected.window;
    } catch (value) {
      if (current()) fail(value);
      return null;
    } finally {
      if (current()) {operation.current = null; request.current = null; setBusy(false);}
    }
  }, [canUse, sessionId, currentBinding, fail]);

  const capture = useCallback(async () => {
    const target = selectedTarget.current;
    if (!canUse || !currentBinding() || operation.current || !target || targetSession.current !== sessionId) return null;
    const controller = new AbortController();
    request.current = controller;
    operation.current = 'capture';
    const stamp = generation.current;
    const captureRequestId = crypto.randomUUID();
    const current = () => currentBinding() && !controller.signal.aborted && liveSession.current === sessionId && generation.current === stamp && request.current === controller;
    setBusy(true); setError('');
    setPendingCapture({captureRequestId, appName: 'Appshot', handoffComplete: false, handoffHeightReady: false, previewEnabled: false, screenshotSrc: ''});
    let drafts;
    let admitted = false;
    try {
      const value = await post(sessionId, 'share-window', {
        pid: target.pid, window_id: target.window_id, process_identity: target.process_identity,
      }, controller.signal);
      if (!current()) return null;
      const extension = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}[value.mediaType];
      if (!extension || typeof value.screenshot !== 'string' || !value.screenshot || typeof value.text !== 'string') {
        throw new Error('窗口没有返回有效快照');
      }
      const name = (value.name || '窗口').replace(/[\\/:*?"<>|]/g, '_');
      const bytes = Uint8Array.from(atob(value.screenshot), character => character.charCodeAt(0));
      drafts = conversation.createDrafts(sessionId, [
        new File([bytes], name + '.' + extension, {type: value.mediaType}),
        new File([value.text], name + '-窗口文字.txt', {type: 'text/plain'}),
      ]);
      const image = drafts.find(draft => draft.kind === 'image');
      const text = drafts.find(draft => draft.kind === 'file');
      const context = {
        sessionId, captureRequestId,
        imageId: image?.id, textId: text?.id,
        appName: value.name || target.app_name,
        windowTitle: value.title ?? target.title,
        accessibilityText: value.text,
        screenshotAlt: name + '.' + extension,
        screenshotSrc: image?.previewUrl,
        // The endpoint supplies a raw screenshot, not Codex's animation snapshot.
        transitionSnapshotSrc: image?.previewUrl,
        transitionSnapshotHeight: 140,
        handoffComplete: true, handoffHeightReady: true,
      };
      for (const draft of drafts) draftContexts.set(draft.file, context);
      if (!inputActions.addAttachments(drafts.map(draft => draft.id))) {
        throw new Error('输入区正在发送，请稍后再加入窗口快照');
      }
      admitted = true;
      onCaptured?.(context);
      return context;
    } catch (value) {
      if (drafts && !admitted) {
        for (const draft of drafts) draftContexts.delete(draft.file);
        conversation.releaseDraftAttachments(drafts);
      }
      if (current()) fail(value);
      return null;
    } finally {
      if (current()) {
        operation.current = null; request.current = null;
        setBusy(false); setPendingCapture(null);
      }
    }
  }, [canUse, sessionId, conversation, inputActions, currentBinding, onCaptured, fail]);

  const captureCurrent = useCallback(async () => {
    if (!canUse || !currentBinding() || operation.current) return null;
    const target = await refresh();
    if (target) return capture();
    if (currentBinding() && selectedGap.current) fail(new Error('当前没有可分享的前台窗口'));
    return null;
  }, [canUse, currentBinding, refresh, capture, fail]);

  const action = useMemo(() => createCodexAppshotAction({
    disabled: !canUse || busy || targetSession.current !== sessionId,
    formatMessage,
    target: target ? {name: target.app_name || target.title, bundleIdentifier: target.app_id} : null,
    onCapture: capture,
  }), [canUse, busy, formatMessage, target, capture]);

  return useMemo(() => ({action, refresh, capture, captureCurrent, cancel, canUse, target, busy, error, gap, pendingCapture}), [action, refresh, capture, captureCurrent, cancel, canUse, target, busy, error, gap, pendingCapture]);
}

/** The caller supplies a context-menu seat; no additional toolbar icon is added. */
export function WindowShare({renderAction, onActionChange, ...props}) {
  const controller = useWindowShareAction(props);
  const publish = useRef(onActionChange);
  publish.current = onActionChange;
  useEffect(() => {publish.current?.(controller);}, [controller]);
  useEffect(() => () => {publish.current?.(null);}, []);
  return renderAction?.(controller) ?? null;
}

/** Adapt our captured images inside conversation.input.attachments.
 * The original owner keeps text uploads, errors, retries, drops and third-party
 * attachments. Only an exact File/image-id/Session match is projected.
 */
export function WindowShareDraftAttachments({renderOriginal, formatMessage, renderHandoff, ...owner}) {
  const captured = [];
  const remaining = [];
  for (const attachment of owner.attachments ?? []) {
    const context = captureImageContext(attachment, owner.sessionId);
    if (context) {
      captured.push({...context, screenshotSrc: attachment.previewUrl, transitionSnapshotSrc: attachment.previewUrl,
        onRemove: () => {
          owner.onRemoveAttachment(attachment.id);
          if ((owner.attachments ?? []).some(value => value.id === context.textId)) owner.onRemoveAttachment(context.textId);
        },
      });
    } else remaining.push(attachment);
  }
  if (!captured.length) return renderOriginal?.(owner) ?? null;
  return <CodexCuScope><CodexAppshotAttachmentRow attachments={captured} formatMessage={formatMessage} renderHandoff={renderHandoff}>
    {renderOriginal?.({...owner, attachments: remaining})}
  </CodexAppshotAttachmentRow></CodexCuScope>;
}

/** Present only our captured image drafts through the existing attachment owner.
 * The single-slot entry, injected props, stores and render authority stay intact.
 * Unknown owner shapes and every unmarked attachment use their original renderer.
 */
export function installWindowShareDraftAttachments(ctx) {
  return ctx.slots.inject('conversation.input.attachments', () =>
    decorateSlotComponent(ctx.slots, 'conversation.input.attachments', key => key === undefined, original => {
      const Original = original.component;
      function WithWindowShareDraftAttachments(props) {
        const knownOwner = typeof props.sessionId === 'string' && props.sessionId.length > 0
          && Array.isArray(props.attachments) && typeof props.canAcceptDrop === 'boolean'
          && typeof props.onAddFiles === 'function' && typeof props.onRemoveAttachment === 'function'
          && typeof props.onRetryFile === 'function' && props.uploads != null && typeof props.uploads === 'object';
        if (!knownOwner || !props.attachments.some(attachment => captureImageContext(attachment, props.sessionId))) {
          return <Original {...props}/>;
        }
        return <WindowShareDraftAttachments {...props}
          renderOriginal={owner => <Original {...props} {...owner}/>}/>;
      }
      return WithWindowShareDraftAttachments;
    }));
}
