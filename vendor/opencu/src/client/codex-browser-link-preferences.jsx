import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownDelegateProvider } from '@deepseek-ai/dsh-client-ui-primitives';

function webUrl(value) {
  if (typeof value !== 'string' || value.length > 32768 || value.includes('\0')) throw new Error('Invalid browser link URL');
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Browser links require an absolute HTTP(S) URL');
  return parsed.href;
}

/** Pass the current session's authenticated default-link callback to a renderer you own. */
export function createCodexPreferredBrowserLinkHandler(openLink, onError) {
  if (typeof openLink !== 'function') throw new Error('A session-bound browser link opener is required');
  return href => {
    const report = error => { if (typeof onError === 'function') onError(error); else console.error('OpenCU browser link failed:', error); };
    let url;
    try { url = webUrl(href); } catch (error) { report(error); return; }
    void Promise.resolve().then(() => openLink({ url })).then(result => {
      if (result === false || result?.ok === false || result?.success === false) throw new Error('Browser link open did not complete');
    }).catch(report);
  };
}

/** Own-scoped Markdown only. The caller must carry its file and image delegates explicitly. */
export function CodexBrowserLinkPreferences({ children, openLink, openFile, fileImages, onError }) {
  const open = useCallback(href => createCodexPreferredBrowserLinkHandler(openLink, onError)(href), [openLink, onError]);
  if (typeof openLink !== 'function') return children;
  return <MarkdownDelegateProvider openExternalLink={open} openFile={openFile} fileImages={fileImages}>
    {children}
  </MarkdownDelegateProvider>;
}

/** An app-owned link uses the same unmodified-activation boundary as official MarkdownAnchor. */
export function CodexBrowserPreferredUrlLink({ href, children, openLink, onError, onClick, ...props }) {
  const normalized = useMemo(() => { try { return webUrl(href); } catch { return null; } }, [href]);
  const activate = useCallback(event => {
    onClick?.(event);
    if (event.defaultPrevented || normalized === null || typeof openLink !== 'function' || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    createCodexPreferredBrowserLinkHandler(openLink, onError)(normalized);
  }, [onClick, openLink, onError, normalized]);
  if (normalized === null) return <>{children}</>;
  return <a {...props} href={normalized} target="_blank" rel="noopener noreferrer" onClick={activate}>{children}</a>;
}

/** Mount only around the ChatView registered by OpenCU's own chat factory. */
export function CodexBrowserOwnedChatLinkConsumer({ children, sessionId, api, onOpenInAppBrowser, onError }) {
  const [error, setError] = useState('');
  const owner = useRef(null);
  useEffect(() => {
    const current = { sessionId, controller: new AbortController() };
    owner.current = current;
    setError('');
    return () => current.controller.abort();
  }, [sessionId]);
  const activate = useCallback(event => {
    const native = event.nativeEvent ?? event;
    if (native.isTrusted !== true || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || !sessionId || typeof api !== 'function') return;
    const current = owner.current;
    if (current?.sessionId !== sessionId || current.controller.signal.aborted) return;
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor || !event.currentTarget.contains(anchor) || anchor.hasAttribute('download')) return;
    const href = anchor.getAttribute('href');
    let url;
    try { url = webUrl(href); } catch { return; }
    event.preventDefault();
    // The owned ChatView's inner Markdown delegate would otherwise open a second destination.
    event.stopPropagation();
    const signal = current.controller.signal;
    setError('');
    void Promise.resolve().then(async () => {
      const state = await api('state', sessionId, undefined, signal);
      signal.throwIfAborted();
      const result = await api('browser-link', sessionId, { url, controlEpoch: state.controlEpoch }, signal);
      signal.throwIfAborted();
      if (result === false || result?.ok === false || result?.success === false) throw new Error('Browser link open did not complete');
      if (result.destination === 'in-app-browser') await onOpenInAppBrowser?.(result, sessionId);
    }).catch(failure => {
      if (signal.aborted || owner.current !== current) return;
      setError(failure.message);
      onError?.(failure);
    });
  }, [sessionId, api, onOpenInAppBrowser, onError]);
  return <div data-opencu-preferred-links="owned-chat" style={{ display: 'contents' }} onClickCapture={activate}>
    {children}
    {error && <p className="tx-cu-error" role="alert">{error}</p>}
  </div>;
}
