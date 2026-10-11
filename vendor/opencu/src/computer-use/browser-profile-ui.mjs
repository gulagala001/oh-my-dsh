import { createBrowserProfile } from './browser-profile.mjs';
import { inspectWebMcpTools } from './browser-webmcp.mjs';
import {readSiteAnnotationFeatures, setSiteAnnotationFeaturesEnabled, setSiteAnnotationFeaturePreview,
  applySiteAnnotationFeaturesEnabled} from './site-annotation-features.mjs';
import {siteAnnotationHostname} from './site-annotation-settings.mjs';
import {restoreQueuedAnnotationSiteControls} from './annotation-site-controls.mjs';

const fail = (message, code = 'BROWSER_PROFILE_UNAVAILABLE') => Object.assign(new Error(message), { code });
const mutations = new Set(['profileRequestAccess', 'profileRevokeAccess', 'profileDownloadAction', 'profileSetSiteSetting',
  'profileClearBrowsingData', 'profileOpenSiteSettings', 'profileRemoveHistory', 'profileSetPreference',
  'profileChooseDownloadDirectory', 'profileResetDownloadDirectory', 'profileResetSiteSettings', 'profileClearSiteSettings',
  'profileOpenSiteInfo', 'siteAnnotationFeaturesSetEnabled', 'siteAnnotationFeaturePreview']);
for(const action of ['profileImportChooseSource','profileImport','profileImportCancelSelection'])mutations.add(action);
const nativeImportActions = new Set(['profileNativeImportSignals', 'profileNativeImportList',
  'profileNativeImportChooseSource', 'profileNativeImport', 'profileNativeImportCancel']);
for (const action of ['profileNativeImportChooseSource', 'profileNativeImport', 'profileNativeImportCancel']) mutations.add(action);
const passwordFileImportActions = new Set(['profilePasswordFileImportSignals', 'profilePasswordFileImportChooseSource',
  'profilePasswordFileImport', 'profilePasswordFileImportCancel']);
for (const action of ['profilePasswordFileImportChooseSource', 'profilePasswordFileImport', 'profilePasswordFileImportCancel']) mutations.add(action);
const annotationActions = new Set(['siteAnnotationFeatures', 'siteAnnotationFeaturesSetEnabled', 'siteAnnotationFeaturePreview']);
const siteActions = new Set(['profileSiteSettings', 'profileSetSiteSetting', 'profileOpenSiteSettings',
  'profileResetSiteSettings', 'profileClearSiteSettings', 'profileOpenSiteInfo', 'siteTools', 'siteToolsRefresh', ...annotationActions]);
const siteMutations = new Set(['profileSetSiteSetting', 'profileResetSiteSettings', 'profileClearSiteSettings']);
const committedSiteMutation = (action, result) => siteMutations.has(action)
  && result?.accepted === true && result.source === 'opencu-permission-store'
  && (result.prefWriteCompleted === true || result.temporaryGrantApplied === true);
const siteSelection = input => Object.fromEntries(['type', 'types', 'scope', 'requestingOrigin', 'embeddingOrigin']
  .filter(key => input[key] !== undefined).map(key => [key, input[key]]));

export async function browserProfileAction(manager, sessionId, input, signal) {
  signal?.throwIfAborted();
  if (manager.closed || !manager.enabled) throw fail('Computer Use is disabled', 'CU_DISABLED');
  const state = manager.session(sessionId), target = manager.viewTarget(state);
  const browser = input.browserId ? manager.browserFor(input.browserId)
    : target?.kind === 'tab' ? manager.browserForTab(target.id, target.browserId) : manager.browserFor('iab');
  const belongs = () => [...state.previewTargets.values()].some(entry => entry.target.kind === 'tab'
    && (entry.target.browserId === browser.id || browser.records.has(entry.target.id)))
    || state.target?.kind === 'tab' && (state.target.browserId === browser.id || browser.records.has(state.target.id));
  const epoch = browser.info?.epoch ?? browser.run?.id;
  const assertCurrent = (terminal = false) => {
    if (!terminal) signal?.throwIfAborted();
    if (manager.closed || !manager.enabled || manager.sessions.get(sessionId) !== state
      || manager.browserFor(browser.id) !== browser || (browser.info?.epoch ?? browser.run?.id) !== epoch) throw fail('The browser profile connection changed', 'STALE_BROWSER_PROFILE');
    if (input.browserEpoch !== undefined && input.browserEpoch !== epoch) throw fail('The browser profile connection changed', 'STALE_BROWSER_PROFILE');
  };
  assertCurrent();
  if (nativeImportActions.has(input.action) && input.browserEpoch !== epoch) throw fail('The native import connection changed', 'STALE_BROWSER_PROFILE');
  if (passwordFileImportActions.has(input.action) && input.browserEpoch !== epoch) throw fail('The password file import connection changed', 'STALE_BROWSER_PROFILE');
  if (input.action !== 'capabilities' && !belongs()) throw fail('This browser is not associated with the conversation', 'STALE_TARGET');
  if (mutations.has(input.action) && input.controlEpoch !== state.controlEpoch) throw fail('The conversation control state changed', 'CONTROL_CHANGED');
  const profile = createBrowserProfile(browser), options = { signal, sessionId, explicitUserCommand: true, trustedUserAction: true };
  if (nativeImportActions.has(input.action)) {
    const viewer = state.viewers.get(input.actor), viewed = manager.viewerTarget(state, input);
    if (!viewer || input.controlEpoch !== state.controlEpoch || viewed?.kind !== 'tab' || input.tabId !== viewed.id
      || manager.browserForTab(viewed.id, viewed.browserId) !== browser) throw fail('The import browser view changed', 'VIEW_CHANGED');
    if (viewer.readOnly && mutations.has(input.action)) throw fail('This preview is read-only', 'READ_ONLY_VIEW');
    const view = manager.viewsFor(viewed).views.get(viewed.id);
    if (!view || view.closed) throw fail('The import browser view disconnected', 'VIEW_CHANGED');
    options.signal = AbortSignal.any([signal, view.lifetime.signal, view.document.signal].filter(Boolean));
  }
  if (nativeImportActions.has(input.action) && typeof profile.getNativeImportSignals !== 'function') throw fail('Native profile importing is unavailable for this browser');
  if (passwordFileImportActions.has(input.action) && typeof profile.getPasswordFileImportSignals !== 'function') throw fail('Password file importing is unavailable for this browser');
  let result;
  if (passwordFileImportActions.has(input.action)) {
    const receiptAction = ['profilePasswordFileImport', 'profilePasswordFileImportCancel'].includes(input.action);
    const keys = ['action', 'browserId', 'browserEpoch', 'tabId', 'actor', 'controlEpoch', 'siteUrl', 'loaderId',
      'siteAnnotationRevision', 'explicitUserCommand', ...(receiptAction ? ['selectionId'] : [])];
    if (Object.keys(input).some(key => !keys.includes(key)) || !Number.isSafeInteger(input.controlEpoch)
      || input.controlEpoch < 0 || input.explicitUserCommand !== undefined && input.explicitUserCommand !== true)
      throw fail('Password file import accepts only its current UI scope and opaque receipt', 'INVALID_BROWSER_PROFILE_ARGUMENT');
    const viewer = state.viewers.get(input.actor), viewed = manager.viewerTarget(state, input);
    const valid = () => !manager.closed && manager.enabled && manager.sessions.get(sessionId) === state
      && manager.browserFor(browser.id) === browser && (browser.info?.epoch ?? browser.run?.id) === epoch
      && input.browserId === browser.id && input.browserEpoch === epoch && input.controlEpoch === state.controlEpoch
      && viewer && (!mutations.has(input.action) || !viewer.readOnly)
      && state.viewers.get(input.actor) === viewer && viewed?.kind === 'tab' && input.tabId === viewed.id
      && manager.viewerTarget(state, input)?.id === viewed.id && manager.browserForTab(viewed.id, viewed.browserId) === browser;
    if (viewer?.readOnly && mutations.has(input.action)) throw fail('This preview is read-only', 'READ_ONLY_VIEW');
    if (!valid()) throw fail('The password import browser view changed', 'VIEW_CHANGED');
    const view = manager.viewsFor(viewed).views.get(viewed.id);
    if (!view || view.closed) throw fail('The password import browser view disconnected', 'VIEW_CHANGED');
    const read = { controller: new AbortController(), valid };
    state.viewReads ??= new Set(); state.viewReads.add(read);
    const lifetime = AbortSignal.any([view.lifetime.signal, view.document.signal, read.controller.signal, signal].filter(Boolean));
    const release = () => state.viewReads.delete(read);
    const importOptions = { ...options, signal: lifetime,
      selectionOwner: JSON.stringify([sessionId, browser.id, epoch, viewed.id, input.actor, input.controlEpoch]), selectionReleased: release };
    let keepSelectionGuard = false;
    try {
      if (input.action === 'profilePasswordFileImportSignals') result = await profile.getPasswordFileImportSignals(importOptions);
      else if (input.action === 'profilePasswordFileImportChooseSource') result = await profile.choosePasswordFileImportSource({}, importOptions);
      else if (input.action === 'profilePasswordFileImport') result = await profile.importPasswordFile({ selectionId: input.selectionId }, importOptions);
      else result = await profile.cancelPasswordFileImport({ selectionId: input.selectionId }, importOptions);
      if (!receiptAction) {
        if (!valid() || lifetime.aborted) {
          if (result.status === 'selected') await profile.cancelPasswordFileImport({ selectionId: result.selectionId }, { ...importOptions, signal: undefined });
          lifetime.throwIfAborted(); throw fail('The password import browser view changed', 'VIEW_CHANGED');
        }
        keepSelectionGuard = result.status === 'selected';
      }
    } finally { if (!keepSelectionGuard) release(); }
  } else if (siteActions.has(input.action)) {
    const viewer = state.viewers.get(input.actor), viewed = manager.viewerTarget(state, input);
    const valid = () => !manager.closed && manager.enabled && manager.sessions.get(sessionId) === state
      && (browser.info?.epoch ?? browser.run?.id) === epoch
      && viewer && state.viewers.get(input.actor) === viewer && input.controlEpoch === state.controlEpoch
      && viewed?.kind === 'tab' && input.tabId === viewed.id && manager.viewerTarget(state, input)?.id === viewed.id
      && manager.browserForTab(viewed.id, viewed.browserId) === browser;
    if (!valid()) throw fail('The viewed site changed', 'VIEW_CHANGED');
    if (viewer.readOnly && ['profileSetSiteSetting', 'profileResetSiteSettings', 'profileClearSiteSettings'].includes(input.action)) throw fail('This preview is read-only', 'READ_ONLY_VIEW');
    const view = manager.viewsFor(viewed).views.get(viewed.id);
    if (!view || view.closed) throw fail('The browser preview has disconnected', 'VIEW_CHANGED');
    const lifetime = AbortSignal.any([view.lifetime.signal, view.document.signal, signal].filter(Boolean));
    if (annotationActions.has(input.action)) {
      if (input.action !== 'siteAnnotationFeatures' && viewer.readOnly) throw fail('This preview is read-only', 'READ_ONLY_VIEW');
      const canPreview = () => valid() && !manager.browserAgentActive(state) && !state.uiAction && !state.resuming;
      const read = {controller: new AbortController(), valid: () => valid()
        && (input.action !== 'siteAnnotationFeaturePreview' || input.preview === null || canPreview())};
      state.viewReads ??= new Set(); state.viewReads.add(read);
      const annotationLifetime = AbortSignal.any([lifetime, read.controller.signal]);
      const settings = manager.siteAnnotationSettings;
      const annotationOptions = {owner: viewer, settings, signal: annotationLifetime, canPreview};
      const operation = input.action === 'siteAnnotationFeatures' ? () => readSiteAnnotationFeatures(manager.viewsFor(viewed), view, annotationOptions)
        : input.action === 'siteAnnotationFeaturesSetEnabled' ? () => setSiteAnnotationFeaturesEnabled(manager.viewsFor(viewed), view, input, annotationOptions)
          : () => setSiteAnnotationFeaturePreview(manager.viewsFor(viewed), view, input, annotationOptions);
      try {
        if (!read.valid()) throw fail('The browser control state changed', 'CONTROL_CHANGED');
        result = await manager.viewsFor(viewed).snapshotRead(view, operation);
        if (input.action === 'siteAnnotationFeaturesSetEnabled') {
          // The source setting belongs to the hostname, not the originating tab.
          for (const views of [manager.browserViews, ...manager.extensionViews.values()]) for (const entry of views.views.values()) {
            if (!entry.closed && !entry.document.signal.aborted
              && siteAnnotationHostname(entry.record.page.url()) === siteAnnotationHostname(input.siteUrl)) await views.snapshotRead(entry,
              async () => {
                await applySiteAnnotationFeaturesEnabled(views, entry, {settings, canPreview: () => true});
                if(entry.siteAnnotationFeaturesEnabled===false)await restoreQueuedAnnotationSiteControls(entry);
              });
          }
          for(const owner of manager.sessions.values())await manager.siteAnnotationRequests.syncSession(owner);
        }
        annotationLifetime.throwIfAborted();
      } finally { state.viewReads.delete(read); }
    } else if (input.action === 'siteTools' || input.action === 'siteToolsRefresh') {
      result = await manager.viewsFor(viewed).snapshotRead(view, () => inspectWebMcpTools(view.record, lifetime));
    } else if (input.action === 'profileSiteSettings') result = await profile.siteSettings(view.sessionId, viewed.id,
      browser.id === 'desktop-browser' ? siteSelection(input) : input.types, { ...options, signal: lifetime });
    else if (input.action === 'profileSetSiteSetting') result = await profile.setSiteSetting(view.sessionId, viewed.id,
      { ...siteSelection(input), type: input.type, ...(input.setting === undefined ? {} : { setting: input.setting }),
        ...(input.geolocation === undefined ? {} : { geolocation: input.geolocation }),
        ...(input.oneTime === undefined ? {} : { oneTime: input.oneTime }) }, { ...options, signal: lifetime });
    else if (input.action === 'profileResetSiteSettings') result = await profile.resetSiteSettings(view.sessionId, viewed.id, siteSelection(input), { ...options, signal: lifetime });
    else if (input.action === 'profileClearSiteSettings') result = await profile.clearSiteSettings(view.sessionId, viewed.id,
      { types: input.types, ...(input.allOrigins === undefined ? {} : { allOrigins: input.allOrigins }),
        ...(input.requestingOrigin === undefined ? {} : { requestingOrigin: input.requestingOrigin }),
        ...(input.embeddingOrigin === undefined ? {} : { embeddingOrigin: input.embeddingOrigin }) }, { ...options, signal: lifetime });
    else if (input.action === 'profileOpenSiteInfo') result = await profile.openSiteInfo(view.sessionId, viewed.id,
      {}, { ...options, signal: lifetime });
    else result = await profile.openSiteSettings(view.sessionId, viewed.id, { ...options, signal: lifetime });
    if (!committedSiteMutation(input.action, result)) {
      lifetime.throwIfAborted();
      if (!valid()) throw fail('The viewed site changed', 'VIEW_CHANGED');
    }
  } else {
    switch (input.action) {
      case 'capabilities': case 'profileStatus': result = await profile.status({ signal, sessionId }); break;
      case 'profileRequestAccess': result = await profile.requestAccess(input.permissions, options); break;
      case 'profileRevokeAccess': result = await profile.revokeAccess(input.permissions, options); break;
      case 'profileGetRequest': result = await profile.getRequest(input.requestId, { signal, sessionId }); break;
      case 'profileCancelRequest': result = await profile.cancelRequest(input.requestId, options); break;
      case 'profileHistory': result = await profile.searchHistory(input.options ?? {}, { signal, sessionId }); break;
      case 'profileRemoveHistory': result = await profile.removeEntries(input.entries, options); break;
      case 'profileDownloads': result = input.options === undefined ? await profile.getDownloadSnapshot({ signal, sessionId })
        : await profile.searchDownloadHistory(input.options, { signal, sessionId }); break;
      case 'profileDownloadHistory': result = await profile.searchDownloadHistory(input.options ?? {}, { signal, sessionId }); break;
      case 'profileDownloadAction': result = await profile.downloadAction(input.downloadAction,
        input.downloadAction === 'acknowledge' ? { ...(input.ids === undefined ? {} : { ids: input.ids }), ...(input.all === undefined ? {} : { all: input.all }) }
          : input.id === undefined ? {} : { id: input.id }, options); break;
      case 'profileBrowsingDataSettings': result = await profile.getBrowsingDataSettings({ signal }); break;
      case 'profilePreferences': result = await profile.getPreferences(options); break;
      case 'profileSetPreference': result = await profile.setPreference({ key: input.key, value: input.value }, options); break;
      case 'profileChooseDownloadDirectory': result = await profile.chooseDownloadDirectory(options); break;
      case 'profileResetDownloadDirectory': result = await profile.resetDownloadDirectory(options); break;
      case 'profileImportSignals': result = await profile.getImportSignals(options); break;
      case 'profileImportList': result = await profile.listImportSources({...(input.selectionId===undefined?{}:{selectionId:input.selectionId})},options); break;
      case 'profileImportChooseSource': result = await profile.chooseImportSource({kind:input.kind},options); break;
      case 'profileImport': result = await profile.importProfile({selectionId:input.selectionId,importHistory:input.importHistory,...(input.dryRun===undefined?{}:{dryRun:input.dryRun})},options); break;
      case 'profileImportCancelSelection': result = await profile.cancelImportSelection({selectionId:input.selectionId},options); break;
      case 'profileNativeImportSignals': result = await profile.getNativeImportSignals(options); break;
      case 'profileNativeImportList': result = await profile.listNativeImportSources({}, options); break;
      case 'profileNativeImportChooseSource': result = await profile.chooseNativeImportSource({ sourceId: input.sourceId,
        importCookies: input.importCookies, importPasswords: input.importPasswords, importHistory: input.importHistory,
        allowElevatedChromeDecryption: input.allowElevatedChromeDecryption,
        ...(input.cookieDomainAllowlist === undefined ? {} : { cookieDomainAllowlist: input.cookieDomainAllowlist }) }, options); break;
      case 'profileNativeImport': result = await profile.importNativeProfile({ selectionId: input.selectionId }, options); break;
      case 'profileNativeImportCancel': result = await profile.cancelNativeImportSelection({ selectionId: input.selectionId }, options); break;
      case 'profileBrowsingDataSummary': result = await profile.getBrowsingDataSummary({ ...(input.timeRange === undefined ? {} : { timeRange: input.timeRange }) }, options); break;
      case 'profileClearBrowsingData': result = await profile.clearBrowsingData(input.options ?? {
        dataTypes: input.dataTypes,
        ...(input.timeRange === undefined ? {} : { timeRange: input.timeRange }),
        ...(input.since === undefined ? {} : { since: input.since }),
      }, options); break;
      default: throw fail('Unknown browser profile action', 'UNSUPPORTED_OPERATION');
    }
  }
  assertCurrent(committedSiteMutation(input.action, result)
    || ['profilePasswordFileImport', 'profilePasswordFileImportCancel', 'profileNativeImport', 'profileNativeImportCancel'].includes(input.action));
  if (input.action === 'capabilities') return { available: result.available, browserId: browser.id, browserEpoch: epoch, profile: result };
  return { browserId: browser.id, browserEpoch: epoch, result };
}
