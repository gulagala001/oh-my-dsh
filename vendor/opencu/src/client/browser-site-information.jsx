import { useCallback, useEffect, useRef, useState } from 'react';

const failure = (message, code = 'NATIVE_SITE_INFO_UNAVAILABLE') => Object.assign(new Error(message), { code });
function webUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** The popup belongs to the actual OpenCU BrowserWindow, never the DSH preview's coordinate space. */
export function useBrowserSiteInformation({ sessionId, scope, browserEpoch, api, pageUrl, documentKey,
  visible, disabled, onOpenSiteInformation, onError }) {
  const siteUrl = webUrl(pageUrl), owner = useRef(null), callbacks = useRef(null);
  const [status, setStatus] = useState({ available: false, pending: false, isOpen: false, reason: '' });
  callbacks.current = { onOpenSiteInformation, onError };
  const active = visible && !disabled && siteUrl !== null && !!sessionId && !!scope?.browserId && !!scope?.tabId
    && typeof scope?.actor === 'string' && !!scope.actor && Number.isSafeInteger(scope?.controlEpoch);

  useEffect(() => {
    const controller = new AbortController();
    const current = { sessionId, scope: { ...scope }, siteUrl, browserEpoch, controller, capabilities: null,
      operation: null, closeRevision: 0, receipt: null };
    owner.current = current;
    setStatus({ available: false, pending: false, isOpen: false, reason: '' });
    if (!active) return () => controller.abort();
    let timer;
    const refresh = async () => {
      try {
        const capabilities = await api('browser-native', sessionId, { ...current.scope, action: 'capabilities' }, controller.signal);
        controller.signal.throwIfAborted();
        if (owner.current !== current) return;
        const info = Array.isArray(capabilities?.siteInfo) ? capabilities.siteInfo.find(item => item.tabId === current.scope.tabId) : null;
        const bound = capabilities?.browserId === current.scope.browserId && typeof capabilities.browserEpoch === 'string'
          && !!capabilities.browserEpoch && (browserEpoch === undefined || capabilities.browserEpoch === browserEpoch);
        const available = bound && info?.available === true && info.persistentReady !== false
          && (info.siteUrl === undefined || webUrl(info.siteUrl) === siteUrl);
        current.capabilities = available ? capabilities : null;
        setStatus(previous => ({ ...previous, available, isOpen: available && previous.isOpen,
          reason: available ? '' : info?.message ?? '当前浏览器尚未提供站点信息。' }));
      } catch (error) {
        if (controller.signal.aborted || owner.current !== current) return;
        current.capabilities = null;
        setStatus(previous => ({ ...previous, available: false, isOpen: false, reason: error.message }));
      }
      if (!controller.signal.aborted && owner.current === current) timer = setTimeout(refresh, 1500);
    };
    const nativeEvent = event => {
      const data = event.detail;
      if (owner.current !== current || controller.signal.aborted || data?.event !== 'page-info-dialog-closed'
        || data.sessionId !== sessionId || data.tabId !== current.scope.tabId || data.actor !== current.scope.actor
        || data.browserId !== current.scope.browserId || data.browserEpoch !== current.capabilities?.browserEpoch
        || data.params?.tabId !== current.scope.tabId) return;
      if (current.receipt?.dialogId !== undefined && data.params.dialogId !== undefined
        && current.receipt.dialogId !== data.params.dialogId) return;
      current.closeRevision++;
      current.receipt = null;
      setStatus(previous => ({ ...previous, isOpen: false }));
      if (data.params?.message || data.params?.error) callbacks.current.onError?.(data.params.message ?? data.params.error);
    };
    window.addEventListener('opencu-browser-native', nativeEvent);
    void refresh();
    return () => {
      controller.abort(); current.operation?.abort(); clearTimeout(timer);
      window.removeEventListener('opencu-browser-native', nativeEvent);
    };
  }, [sessionId, api, active, scope?.browserId, scope?.tabId, scope?.actor, scope?.controlEpoch,
    scope?.loaderId, browserEpoch, siteUrl, documentKey]);

  const open = useCallback(async request => {
    const current = owner.current;
    if (!current || !active || current.controller.signal.aborted || !current.capabilities) {
      throw failure(status.reason || '站点信息目前不可用。');
    }
    if (current.operation) throw failure('站点信息请求正在处理中。', 'NATIVE_SITE_INFO_PENDING');
    if (request.browserTabId !== current.scope.tabId || request.conversationId !== current.sessionId
      || webUrl(request.siteUrl) !== current.siteUrl) throw failure('站点信息目标已改变。', 'VIEW_CHANGED');
    const controller = new AbortController(), signal = AbortSignal.any([current.controller.signal, controller.signal]);
    current.operation = controller;
    const closeRevision = current.closeRevision, epoch = current.capabilities.browserEpoch;
    setStatus(previous => ({ ...previous, pending: true, isOpen: false }));
    try {
      const input = { ...current.scope, action: 'tabs.pageInfo', browserEpoch: epoch, siteUrl: current.siteUrl,
        presentation: 'opencu-browser-window' };
      const envelope = callbacks.current.onOpenSiteInformation
        ? await callbacks.current.onOpenSiteInformation({ ...input, browserTabId: current.scope.tabId,
          conversationId: current.sessionId }, { signal })
        : await api('browser-native', current.sessionId, input, signal);
      signal.throwIfAborted();
      if (owner.current !== current || current.capabilities?.browserEpoch !== epoch) throw failure('浏览器连接已改变。', 'EXTENSION_CONNECTION_CHANGED');
      if (envelope?.browserId !== current.scope.browserId || envelope?.browserEpoch !== epoch) throw failure('浏览器没有返回原目标的站点信息回执。', 'INVALID_NATIVE_RESPONSE');
      const result = envelope.result;
      if (result?.accepted !== true || result.opened !== true || result.closed === true || result.changed === true
        || typeof result.dialogId !== 'string' || !result.dialogId) {
        throw failure(result?.message ?? '浏览器未打开站点信息。', result?.code ?? 'NATIVE_SITE_INFO_REJECTED');
      }
      if (webUrl(result.siteUrl) !== current.siteUrl
        || result.tabId !== current.scope.tabId) throw failure('站点信息回执的页面身份已改变。', 'VIEW_CHANGED');
      if (current.closeRevision !== closeRevision) throw failure('站点信息面板已关闭。', 'NATIVE_SITE_INFO_CLOSED');
      current.receipt = result;
      setStatus(previous => ({ ...previous, isOpen: true }));
      return result;
    } catch (error) {
      if (owner.current === current && !current.controller.signal.aborted) {
        setStatus(previous => ({ ...previous, isOpen: false }));
        callbacks.current.onError?.(error.message);
        error.nativeSiteInfoReported = true;
      }
      throw error;
    } finally {
      if (current.operation === controller) current.operation = null;
      if (owner.current === current && !current.controller.signal.aborted) setStatus(previous => ({ ...previous, pending: false }));
    }
  }, [api, active, status.reason]);
  return { ...status, open };
}
