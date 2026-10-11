// Source cIi's PointerSensor and pIi/mIi/PFi predicates. Only this plugin's
// registered tab rows participate; no host tab or conversation DOM is queried.
export const CODEX_BROWSER_TAB_DRAG_DISTANCE = 6;

const nonempty = value => typeof value === 'string' && value.length > 0;

export function canTransferBrowserTab(tab) {
  return tab?.available === true && tab.canTransfer === true && !tab.detached
    && nonempty(tab.id) && nonempty(tab.browserId) && nonempty(tab.browserEpoch)
    && typeof tab.title === 'string' && typeof tab.url === 'string' && nonempty(tab.providerTabId);
}

export function browserTabTransferInput(tab, controlEpoch, action = 'detach') {
  if (!Number.isSafeInteger(controlEpoch) || controlEpoch < 0 || !nonempty(tab?.id)
      || !nonempty(tab.browserId) || !nonempty(tab.browserEpoch)
      || typeof tab.title !== 'string' || typeof tab.url !== 'string' || !nonempty(tab.providerTabId)) {
    throw new Error('The displayed browser tab identity is unavailable');
  }
  const input = {action, tabId: tab.id, browserId: tab.browserId, browserEpoch: tab.browserEpoch, controlEpoch,
    expected: {title: tab.title, url: tab.url, providerTabId: tab.providerTabId}};
  if (action !== 'detach') {
    if (!nonempty(tab.detached?.id)) throw new Error('The detached browser window identity is unavailable');
    input.detachedId = tab.detached.id;
  }
  return input;
}

export function isBrowserTabNewWindowDrop(point, over, rows, viewport) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  if (point.x < 0 || point.y < 0 || point.x >= viewport.width || point.y >= viewport.height) return true;
  return over == null && !rows.some(rect => rect.right > rect.left && rect.bottom > rect.top
    && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom);
}

export function isDetachedBrowserResult(result) {
  return nonempty(result?.id) && result.contentKind === 'browser' && result.phase === 'detached'
    && [result.windowId, result.sourceWindowId].every(value => Number.isSafeInteger(value) && value > 0);
}
