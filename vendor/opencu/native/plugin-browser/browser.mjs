import { createHash, randomUUID } from "node:crypto";
import { constants, accessSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BaseWindow, clipboard, ClipboardItem, session, shell, WebContentsView } from "electron";
import { jsonValue as isDesktopComputerUseJson, deferred } from "./ipc.mjs";
import { BrowserAuthContainment } from "./auth-containment.mjs";
import { NativeBrowserProfile } from "./native-profile.mjs";
const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];
const CLEANUP_TIMEOUT_MS = 1e4;
const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const MAX_CAPTURE_PIXELS = 16777216;
const MAX_UPLOAD_SNAPSHOT_NODES = 262144;
const PROFILE_OWNERS = /* @__PURE__ */ new WeakMap();
const SCOPED_DOMAINS = /* @__PURE__ */ new Set([
  "Accessibility",
  "Animation",
  "Audits",
  "CSS",
  "DOM",
  "DOMDebugger",
  "DOMSnapshot",
  "Debugger",
  "Emulation",
  "Fetch",
  "Input",
  "Inspector",
  "Log",
  "Network",
  "Overlay",
  "Page",
  "Performance",
  "Profiler",
  "Runtime",
  "Security"
]);
const TARGET_COMMANDS = /* @__PURE__ */ new Set(["Target.getTargetInfo", "Target.setAutoAttach", "Target.attachToTarget", "Target.detachFromTarget"]);
const FORBIDDEN_COMMANDS = /* @__PURE__ */ new Set([
  "Page.setDownloadBehavior",
  "Network.getAllCookies",
  "Network.clearBrowserCookies",
  "Network.clearBrowserCache",
  "Network.setCookie",
  "Network.setCookies",
  "Network.deleteCookies",
  "Security.setIgnoreCertificateErrors",
  "Security.setOverrideCertificateErrors",
  "Security.handleCertificateError"
]);
const EVALUATION_COMMANDS = /* @__PURE__ */ new Set(["Runtime.evaluate", "Runtime.callFunctionOn", "Runtime.runScript"]);
const OVERRIDE_COMMANDS = /* @__PURE__ */ new Map([
  ["Fetch.enable", { kind: "fetch", reset: { method: "Fetch.disable", params: {} } }],
  ["Fetch.disable", { kind: "fetch", reset: { method: "Fetch.disable", params: {} } }],
  ["Emulation.setDeviceMetricsOverride", { kind: "metrics", reset: { method: "Emulation.clearDeviceMetricsOverride", params: {} } }],
  ["Emulation.clearDeviceMetricsOverride", { kind: "metrics", reset: { method: "Emulation.clearDeviceMetricsOverride", params: {} } }],
  ["Emulation.setTouchEmulationEnabled", { kind: "touch", reset: { method: "Emulation.setTouchEmulationEnabled", params: { enabled: false } } }],
  ["Emulation.setUserAgentOverride", { kind: "ua", reset: { method: "Emulation.setUserAgentOverride", params: { userAgent: "" } } }],
  ["Emulation.setFocusEmulationEnabled", { kind: "focus", reset: { method: "Emulation.setFocusEmulationEnabled", params: { enabled: false } } }],
  ["Emulation.setEmulatedMedia", { kind: "media", reset: { method: "Emulation.setEmulatedMedia", params: { media: "", features: [] } } }],
  ["Emulation.setGeolocationOverride", { kind: "geolocation", reset: { method: "Emulation.clearGeolocationOverride", params: {} } }],
  ["Emulation.clearGeolocationOverride", { kind: "geolocation", reset: { method: "Emulation.clearGeolocationOverride", params: {} } }],
  ["Emulation.setTimezoneOverride", { kind: "timezone", reset: { method: "Emulation.setTimezoneOverride", params: { timezoneId: "" } } }]
]);
function fail(message, code = "INVALID_ARGUMENT") {
  return Object.assign(new Error(`desktop computer use: ${message}`), { code, ...code === "INPUT_RELEASE_FAILED" ? { released: false } : {} });
}
function cleanupFailure(errors, message) {
  return Object.assign(new AggregateError(errors, `desktop computer use: ${message}`), { code: "INPUT_RELEASE_FAILED", released: false });
}
function object(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw fail("expected an object");
  return value;
}
function identifier(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || /[\x00-\x1f]/u.test(value)) throw fail(`invalid ${name}`);
  return value;
}
function numericId(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw fail("tabId must be an owned WebContents id");
  return value;
}
function nativeData(value) {
  if (!isDesktopComputerUseJson(value)) throw fail("native result is not bounded finite JSON", "INVALID_NATIVE_RESULT");
  return value;
}
function count(value, name, defaultValue, maximum = 2147483647) {
  if (value === void 0) return defaultValue;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > maximum) throw fail(`invalid ${name}`);
  return value;
}
function sameFrame(first, second) {
  return !first.isDestroyed() && !second.isDestroyed() && first.processId === second.processId && first.routingId === second.routingId && first.frameTreeNodeId === second.frameTreeNodeId && first.frameToken === second.frameToken;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function zoomPercent(factor) {
  return Math.round(factor * 100 * 1e6) / 1e6;
}
function hostname(url) {
  return url.hostname.toLowerCase().replace(/\.+$/u, "");
}
function effectivePort(url) {
  return url.port || (["https:", "wss:"].includes(url.protocol) ? "443" : "80");
}
function loopback(host) {
  return host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "[::]" || /^127\.\d+\.\d+\.\d+$/u.test(host) || host === "[::1]" || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/u.test(host);
}
async function resultWithin(promise, description) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(fail(`${description} did not settle`, "INPUT_RELEASE_FAILED"));
        }, CLEANUP_TIMEOUT_MS);
      })
    ]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function settledWithin(promises, description) {
  if (promises.length) await resultWithin(Promise.allSettled(promises), description);
}
class DesktopComputerUseBrowser {
  /** @param options - authenticated main-process dependencies and isolated profile location. */
  constructor(options) {
    this.options = options;
    this.authContainment = new BrowserAuthContainment(this);
    if (!isAbsolute(options.storageDirectory)) throw fail("storageDirectory must be absolute");
    mkdirSync(resolve(options.storageDirectory), { recursive: true, mode: 0o700 });
    const directory = realpathSync(resolve(options.storageDirectory));
    // Create cache parents before Chromium's sandboxed network service receives this profile.
    for (const path of [directory, join(directory, "Cache", "Cache_Data"), join(directory, "Shared Dictionary", "cache")]) {
      mkdirSync(path, { recursive: true, mode: 0o700 });
      const info = lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink() || process.getuid && info.uid !== process.getuid()) throw fail("profile cache directory is not a private owned directory");
      accessSync(path, constants.R_OK | constants.W_OK | constants.X_OK);
    }
    this.browserId = `desktop-opencu-${createHash("sha256").update(directory).digest("hex").slice(0, 24)}`;
    this.browserSession = session.fromPath(directory, { cache: true });
    this.nativeProfile = new NativeBrowserProfile(this);
    if (PROFILE_OWNERS.has(this.browserSession)) throw fail("profile is still owned by another provider", "TAB_BUSY");
    PROFILE_OWNERS.set(this.browserSession, this);
    try {
      this.configureSession();
    } catch (error) {
      const failures = [error];
      try {
        if (this.permissionHandlerInstalled) {
          this.browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
          this.browserSession.setPermissionCheckHandler(() => false);
          this.permissionHandlerInstalled = false;
        }
        this.browserSession.removeListener("will-download", this.receiveDownload);
        this.browserSession.removeListener("download-history-changed", this.downloadHistoryChanged);
        this.browserSession.webRequest.onBeforeRequest(null);
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
      if (failures.length === 1 && PROFILE_OWNERS.get(this.browserSession) === this) PROFILE_OWNERS.delete(this.browserSession);
      if (failures.length > 1) throw cleanupFailure(failures, "native browser setup cleanup failed");
      throw error;
    }
  }
  /** Dedicated persistent profile; trusted main-process policy actors may configure it. */
  browserSession;
  tabs = /* @__PURE__ */ new Map();
  destroyedTabs = /* @__PURE__ */ new Set();
  creations = /* @__PURE__ */ new Map();
  issuedCreations = /* @__PURE__ */ new Set();
  ended = /* @__PURE__ */ new Map();
  issuedLeases = /* @__PURE__ */ new Set();
  captures = /* @__PURE__ */ new Set();
  nativeJobs = /* @__PURE__ */ new Set();
  authContainment;
  previewCaptureQueue = Promise.resolve();
  permissionPrompts = /* @__PURE__ */ new Map();
  permissionLifecycles = /* @__PURE__ */ new Set();
  tabFileCleanups = /* @__PURE__ */ new Map();
  fileCleanupTabs = /* @__PURE__ */ new Set();
  browserId;
  hiddenWindow;
  generation = 0;
  closing = false;
  disposed = false;
  disposal;
  permissionHandlerInstalled = false;
  promptGeneration = 0;
  permissionGrants = new Map();
  downloadPermits = new Map();
  downloads = new Map();
  restoredDownloads = new Map();
  downloadHistoryChanged = () => {
    this.emit("download-history-changed", { browserId: "desktop-browser" });
  };
  downloadHandler;
  receiveDownload = (event, item, contents) => {
    try {
      if (!this.closing && this.options.downloadStore) {
        const restored = this.options.downloadStore.consumeRestoration(item, contents);
        if (restored) {
          this.options.downloadStore.attach(item, restored);
          const done = deferred(); item.once("done", (_event, state) => done.resolve(state));
          this.restoredDownloads.set(restored.id, { item, done }); return;
        }
      }
      const tab = contents == null || contents.isDestroyed() ? undefined : this.tabs.get(contents.id);
      if (this.closing || !tab || tab.view.webContents !== contents) { event.preventDefault(); return; }
      if (this.downloadHandler !== void 0) this.downloadHandler(event, item, contents);
      else this.acceptDownload(event, item, tab);
    } catch (error) {
      if (![...this.downloads.values()].some(download => download.item === item)) event.preventDefault();
      console.error("desktop computer use download handler:", error);
    }
  };
  /**
   * Resolve one live owned guest for trusted native policy actors.
   * @param tabId - real Electron WebContents id; host and plugin guests are never accepted.
   * @returns the owned guest, retained by this provider until closed.
   */
  getOwnedContents(tabId) {
    return this.tab(tabId).view.webContents;
  }
  /**
   * Report authoritative destruction observed for a tab this provider created.
   * @param tabId - actual WebContents id of a formerly owned tab.
   * @returns true only after its native destroyed event was received.
   */
  isTabDestroyed(tabId) {
    return this.destroyedTabs.has(tabId);
  }
  /** Bind private authentication to one actual leased native document. */
  async browserAuthBinding(params, signal) {
    const document = await this.authContainment.documentBinding(params, signal);
    const protection = params.protectionId === undefined ? undefined : this.authContainment.binding(params);
    if (protection && (protection.frameId !== document.frameId || protection.loaderId !== document.loaderId
      || protection.documentBackendNodeId !== document.documentBackendNodeId)) throw fail("credential protection addresses another document", "STALE_TARGET");
    const origin = new URL(document.url).origin;
    return { tab: document.tab, tabId: document.tab.id, frameId: document.frameId,
      loaderId: document.loaderId, targetId: document.targetId, origin,
      frameOrigin: document.frameOrigin, documentGeneration: document.documentGeneration,
      documentBackendNodeId: document.documentBackendNodeId, assertCurrent: document.assertCurrent,
      assertProtected: () => {
        document.assertCurrent();
        if (!protection || this.authContainment.bindings.get(protection.protectionId) !== protection
          || !this.authContainment.hasWorkerProtection(protection) || protection.workerFailure || protection.targetRejected
          || document.tab.view.webContents.mainFrame.frames.length !== 0 || this.authContainment.hasExistingPopup(protection)) {
          throw fail("private authentication target containment is unavailable", "BROWSER_AUTH_CONTAINMENT_FAILED");
        }
        protection.assertCurrent(); return true;
      } };
  }
  /**
   * Verify a grant still addresses the same live native page and actor.
   * @param request - browser-issued upload identity supplied to the native policy.
   * @param signal - cancellation while querying the actual target.
   * @returns after target, session, URLs, origin, and actor remain unchanged.
   */
  async assertFileUploadRequest(request, signal) {
    const control = this.control(this.tab(request.tabId), { leaseId: request.leaseId });
    this.assertControl(control, request.actorId);
    const current = await this.uploadIdentity(control, request.actorId, request.sessionId, { backendNodeId: request.backendNodeId }, signal);
    for (const key of ["rootTargetId", "rootUrl", "targetId", "sessionId", "frameId", "loaderId", "documentBackendNodeId", "backendNodeId", "url", "origin"]) {
      if (current[key] !== request[key]) throw fail("upload target changed before authorization was consumed", "STALE_TARGET");
    }
  }
  /**
   * Register a trusted native download actor for owned pages in this profile.
   * @param handler - validates and owns real DownloadItems; callback failures deny the download.
   * @returns disposer restoring the provider's download-deny policy.
   */
  registerDownloadHandler(handler) {
    if (this.closing || this.downloadHandler !== void 0) throw fail("download handler is unavailable or already registered");
    this.downloadHandler = handler;
    return () => {
      if (this.downloadHandler === handler) this.downloadHandler = void 0;
    };
  }
  /**
   * Dispatch one validated OpenCU request without replaying mutations.
   * @param method - supported browser operation.
   * @param params - JSON received from the authenticated desktop transport.
   * @param options - optional cancellation for this request.
   * @returns finite JSON from owned pages or this provider's isolated native profile.
   */
  async handle(method, params, options = {}) {
    if (this.closing) throw fail("provider is closing", "CONTROL_STOPPED");
    options.signal?.throwIfAborted();
    const value = object(params);
    if ((["tabs.presentation", "tabs.captureClipboard", "tabs.pageInfo", "permissions.respond", "permissions.openSystemSettings", "history.remove", "tabs.detach"].includes(method)
      || method.startsWith("browserDetached.") || method === "history.clear" || method.startsWith("profile.downloads.") && !["profile.downloads.getSnapshot", "profile.downloads.searchHistory"].includes(method)
      || ["downloads.pause", "downloads.resume", "downloads.cancel", "downloads.removeFromHistory", "downloads.open", "downloads.showInFolder", "downloads.clearHistory", "downloads.showDownloadsFolder"].includes(method)
      || method === "downloads.action" && ["open", "showInFolder"].includes(value.action))
      && options.trustedUserAction !== true) throw fail("This operation requires the trusted user-action route", "USER_ACTION_REQUIRED");
    if (method === "browser.info") return this.info();
    if (method === "browser.nativeCapabilities") return this.nativeCapabilities();
    if (method.startsWith("siteSettings.")) return this.nativeProfile.settings(method, value, options);
    if (method === "browser.authNewTargetProtection") return this.authContainment.handleTargets(value, options.signal);
    if (method === "browser.authServiceWorkerProtection") return this.authContainment.handleWorkers(value, options.signal);
    if (method.startsWith("preferences.") || method.startsWith("browsingData.")) {
      if (!this.options.preferences) throw fail("Browser preferences are not ready", "BROWSER_PREFERENCES_UNAVAILABLE");
      return this.historyJob(() => this.options.preferences.handle(method, value, { signal: options.signal, trustedUserAction: options.trustedUserAction === true }));
    }
    if (method.startsWith("history.")) return this.historyOperation(method, value, options.signal);
    if (method.startsWith("downloads.")) return this.downloadOperation(method, value, options.signal, options.trustedUserAction === true);
    if (method.startsWith("profile.downloads.")) return this.options.downloadStore.handle(method, value, { signal: options.signal, trustedUserAction: options.trustedUserAction === true });
    if (method.startsWith("permissions.")) return this.permissionOperation(method, value, options.signal);
    if (method === "tabs.list") return [...this.tabs.values()].filter((tab2) => !tab2.view.webContents.isDestroyed()).map((tab2) => this.describe(tab2));
    if (method === "tabs.create") return this.create(value, options.signal, options.trustedUserAction === true ? false : null);
    if (method === "tabs.cancelCreate") return this.cancelCreation(value);
    if (method === "tabs.commitCreate") return this.commitCreation(value, options.signal);
    if (method === "stop" && value.tabId === void 0) {
      const results = await Promise.allSettled([...this.tabs.values()].flatMap((tab2) => tab2.control === void 0 ? [] : [this.stop(tab2.control, "released")]));
      const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
      if (errors.length) throw cleanupFailure(errors, "control release failed");
      return { released: true };
    }
    const id = numericId(value.tabId);
    if (["stop", "detach", "stop-actor"].includes(method)) {
      const leaseId = identifier(value.leaseId, "leaseId");
      const tab2 = this.tabs.get(id), control2 = tab2?.control;
      if (control2?.leaseId === leaseId) return method === "stop-actor" ? this.stopActor(control2, identifier(value.actorId, "actorId")) : this.stop(control2, "released");
      const ended = this.ended.get(leaseId);
      if (ended?.tabId === id) {
        if (!ended.released && ended.control && (this.destroyedTabs.has(id) || ended.reason === "target_closed"))
          return this.releaseDestroyedControl(ended.control);
        if (!ended.released) throw fail(ended.errors.join("; ") || "input release was not confirmed", "INPUT_RELEASE_FAILED");
        return { released: true };
      }
      throw fail("lease has ended; explicitly select the page again", "CONTROL_STOPPED");
    }
    const tab = this.tab(id);
    if (method === "tabs.agentActivity") {
      if (options.trustedAgentLifecycle !== true || typeof value.active !== "boolean" || Object.keys(value).some(key => !["tabId", "active"].includes(key))) throw fail("Agent activity requires the private real execution lifecycle route", "INVALID_AGENT_LIFECYCLE");
      this.setAgentActive(tab, value.active); return { tabId: tab.id, active: tab.agentActive };
    }
    if (method === "tabs.detach") return this.detachTab(tab, value, options.signal);
    if (method.startsWith("browserDetached.")) {
      if (value.leaseId !== undefined || value.actorId !== undefined) this.assertControl(this.control(tab, value), identifier(value.actorId, "actorId"));
      const detachedId = identifier(value.detachedId, "detachedId");
      if (method === "browserDetached.get") return this.detachedRequest(tab, detachedId);
      if (method === "browserDetached.focus") return this.focusDetachedWindow(tab, detachedId);
      if (method === "browserDetached.focusSource") return this.focusDetachedSource(tab, detachedId);
      if (method === "browserDetached.setAlwaysOnTop") return this.setDetachedAlwaysOnTop(tab, detachedId, value.alwaysOnTop);
      if (method === "browserDetached.restore") return this.restoreDetached(tab, detachedId);
    }
    if (method === "tabs.get") {
      this.assertExpected(tab, value.expected);
      return this.describe(tab);
    }
    if (method === "tabs.focus") return this.focus(tab, value);
    if (method === "tabs.presentation") return this.presentation(tab, value);
    if (method === "tabs.captureClipboard") return this.captureClipboard(tab, value, options.signal);
    if (method === "tabs.pageInfo") return this.pageInfo(tab, value);
    if (method === "attach") return this.attach(tab, value, options.signal);
    const control = this.control(tab, value);
    if (method === "annotation.preloadIdentity") return this.annotationPreloadIdentity(control, value, options.signal);
    if (method === "tabs.zoom") return this.zoom(control, value, options.signal);
    if (method === "close") {
      await this.stop(control, "tab-closed");
      options.signal?.throwIfAborted();
      await this.closeTab(tab);
      return { success: true };
    }
    if (method === "command") return this.command(control, value, options.signal);
    throw fail(`unsupported operation: ${method}`, "UNSUPPORTED_OPERATION");
  }
  /**
   * Await input/script release and destruction of owned guests; failures retain resources for retry.
   * @returns after all provider-owned pages and the hidden window are gone.
   */
  async dispose() {
    if (this.disposed) return;
    if (this.disposal !== void 0) return this.disposal;
    this.closing = true;
    for (const creation of this.creations.values()) creation.cancelled = true;
    const pending = this.disposeOwned();
    this.disposal = pending;
    try {
      await pending;
    } finally {
      if (this.disposal === pending) this.disposal = void 0;
    }
  }
  async disposeOwned() {
    if (this.permissionHandlerInstalled) {
      await this.nativeProfile.dispose();
      this.permissionHandlerInstalled = false;
    }
    const creationResults = await Promise.allSettled([...this.creations.values()].map((creation) => this.cancelCreated(creation)));
    await this.releaseDownloads();
    await settledWithin([...this.captures], "clipboard captures");
    await settledWithin([...this.nativeJobs], "native profile operations");
    const results = await Promise.allSettled([...this.tabs.values()].map(async (tab) => {
      if (tab.control !== void 0) await this.stop(tab.control, "provider-disposed");
      await this.closeTab(tab);
    }));
    const fileResults = await Promise.allSettled([...this.fileCleanupTabs].map((id) => this.releaseTabFiles(id)));
    const errors = [...creationResults, ...results, ...fileResults].flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (errors.length) throw cleanupFailure(errors, "disposal did not complete");
    await this.dismissPermissionPrompts();
    this.creations.clear();
    this.hiddenWindow?.destroy();
    this.hiddenWindow = void 0;
    this.downloadHandler = void 0;
    this.browserSession.removeListener("will-download", this.receiveDownload);
    this.browserSession.removeListener("download-history-changed", this.downloadHistoryChanged);
    this.browserSession.webRequest.onBeforeRequest(null);
    if (PROFILE_OWNERS.get(this.browserSession) === this) PROFILE_OWNERS.delete(this.browserSession);
    this.disposed = true;
  }
  info() {
    const native = this.nativeCapabilities();
    return {
      id: "desktop-browser", kind: "desktop", type: "iab", name: "OpenCU In-App Browser",
      userAgent: this.browserSession.getUserAgent(), version: process.versions.electron,
      chromeVersion: process.versions.chrome, protocolVersion: "1.3",
      capabilities: ["provider-tab-identity", "tab-lifecycle", "tab-focus", "tab-zoom",
        "native-clipboard-image", "desktop-presentation", "browser-permissions", "live-downloads",
        ...(this.options.detachedRendererReady === true ? ["browser-detached-window"] : []),
        ...(native.preferences.available === true ? ["browser-preferences"] : []),
        ...(native.history.available === true ? ["profile-history"] : []),
        ...(native.downloads.persistentHistory === true ? ["profile-download-history"] : []),
        ...(this.options.authorizeFileUpload === undefined ? [] : ["file-upload"])],
      metadata: { backend: "desktop", runtime: "plugin-electron", provider: "electron-webcontents-view",
        profile: this.browserId, persistent: this.browserSession.isPersistent(), testKeychain: this.options.testKeychain === true, native,
        siteInfo: native.siteInfo.some(value => value.available), profileHistory: native.history.available === true,
        profileDownloadHistory: native.downloads.persistentHistory === true,
        nativeSiteInfo: false, nativeProfileHistory: false, nativeProfileDownloadHistory: false,
        fileUploadAuthorization: this.options.authorizeFileUpload === undefined ? "unavailable" : "agent-approval-once" },
    };
  }
  sessionCapabilities(kind) {
    if (kind === "permissions") return this.nativeProfile.capabilities();
    if (kind === "downloads") {
      const store = this.options.downloadStore?.getCapabilities() ?? {};
      return { available: true, provider: "electron-download-item", liveItems: true,
        actions: ["pause", "resume", "cancel", "open", "showInFolder"], fileExistsSource: "filesystem", ...store,
        persistentHistory: store.available === true && store.persistentReady === true && store.scope === "opencu-owned-browser" };
    }
    return this.options.history?.getCapabilities() ?? { available: false, reason: "browser-history-initializing" };
  }
  pageInfoCapabilities(tab) {
    return this.options.siteInformation?.capabilities(tab) ?? { available: false, provider: "opencu-site-information", nativeProvider: false };
  }
  nativeCapabilities() {
    return { history: this.sessionCapabilities("history"), downloads: this.sessionCapabilities("downloads"),
      permissions: this.sessionCapabilities("permissions"), siteInfo: [...this.tabs.values()]
        .filter(tab => !tab.view.webContents.isDestroyed()).map(tab => ({ tabId: tab.id, ...this.pageInfoCapabilities(tab) })),
      siteSettings: { ...this.nativeProfile.settingsCapabilities(),
        settingsPage: this.options.siteInformation !== undefined, nativeSettingsPage: false },
      nativeProfileImport: this.options.nativeProfileImporter?.capabilities?.() ?? { available: false, persistentReady: false },
      preferences: this.options.preferences?.getCapabilities() ?? { available: false, reason: "browser-preferences-initializing" },
      browsingData: this.options.preferences?.getBrowsingDataCapabilities() ?? { available: false, reason: "browser-preferences-initializing" } };
  }
  pageInfo(tab, value) {
    if (!this.options.siteInformation) throw fail("Site information is not ready", "SITE_INFO_UNAVAILABLE");
    return this.options.siteInformation.open(tab, value, { trustedUserAction: true });
  }
  historyJob(work) {
    const job = Promise.resolve().then(work); this.nativeJobs.add(job);
    void job.finally(() => this.nativeJobs.delete(job)).catch(error => console.error("OpenCU browser service:", errorMessage(error)));
    return job;
  }
  historyOperation(method, value, signal) {
    if (this.sessionCapabilities("history").available !== true) throw fail("Browser history is not ready", "NATIVE_PROFILE_UNAVAILABLE");
    return this.historyJob(async () => {
      signal?.throwIfAborted();
      const normalized = method === "history.remove" ? { entries: value.entries } : value.options ?? value;
      const result = await this.options.history.handle(method, normalized, { signal });
      if (["history.remove", "history.clear"].includes(method)) this.emit("history-changed", { reason: method, result });
      return result;
    });
  }
  recordNavigation(tab, url, source, httpResponseCode) {
    if (!this.options.history || !this.allowedNavigation(url) || url === "about:blank" || tab.view.webContents.isDestroyed()) return;
    const start = tab.navigationStart, matched = start !== undefined && !start.ambiguous && start.url === url;
    const navigationId = matched ? start.id : `${this.options.processInstanceId}:${tab.id}:${tab.generation}:commit:${++tab.navigationSequence}`;
    tab.navigationStart = undefined; tab.committedNavigationId = navigationId;
    const commit = { navigationId, tabId: tab.id, url, title: tab.view.webContents.getTitle(), visitedAt: Date.now(),
      isActorVisit: matched ? start.agentActive : null, actorSnapshotSource: matched ? "electron-did-start-navigation" : "unavailable", source,
      ...(httpResponseCode === undefined ? {} : { httpResponseCode }) };
    void this.historyJob(async () => { const result = await this.options.history.recordCommit(commit);
      if (result.recorded) this.emit("history-changed", { reason: "navigation", tabId: tab.id, navigationId }); });
  }
  setAgentActive(tab, active) {
    tab.agentActive = active;
  }
  requestPermissionDismissal(binding) { return this.historyJob(() => this.finishPermission(binding, false)); }
  async dismissPermissionPrompts(tab, leaseId, actorId) {
    const pending = [];
    for (const binding of [...this.permissionPrompts.values()]) if ((tab === undefined || binding.tab === tab)
      && (leaseId === undefined || binding.leaseId === leaseId) && (actorId === undefined || binding.actorId === actorId)) pending.push(this.finishPermission(binding, false));
    for (const [key, grant] of this.permissionGrants) if ((tab === undefined || grant.tab === tab)
      && (leaseId === undefined || grant.leaseId === leaseId) && (actorId === undefined || grant.actorId === actorId)) this.permissionGrants.delete(key);
    await Promise.all(pending);
  }
  permissionDocument(tab, details) {
    const contents = tab.view.webContents, frame = contents.mainFrame;
    if (contents.isDestroyed() || details?.isMainFrame !== true || frame.isDestroyed()
      || typeof details.requestingUrl !== "string" || !URL.canParse(details.requestingUrl)
      || !this.allowedNavigation(details.requestingUrl) || new URL(details.requestingUrl).href !== frame.url
      || frame.origin === "null" || new URL(details.requestingUrl).origin !== frame.origin
      || details.securityOrigin !== undefined && new URL(details.securityOrigin).origin !== frame.origin) {
      throw fail("Official Electron did not identify the current main-frame permission document", "STALE_TARGET");
    }
    return { frame, frameUrl: frame.url, frameOrigin: frame.origin, documentGeneration: tab.documentGeneration ?? 0 };
  }
  receiveStockPermission = (contents, permission, callback, details) => {
    let called = false;
    const respond = allowed => { if (!called) { called = true; callback(allowed); } };
    try {
      const tab = contents && !contents.isDestroyed() ? this.tabs.get(contents.id) : undefined;
      if (this.closing || !tab || tab.view.webContents !== contents
        || !["media", "geolocation", "notifications", "clipboard-read", "pointerLock", "fullscreen"].includes(permission)
        || this.permissionPrompts.size >= 128) { respond(false); return; }
      const document = this.permissionDocument(tab, details), id = randomUUID(), generation = ++this.promptGeneration;
      const actors = [...(tab.control?.activeActors ?? [])];
      if (tab.control && actors.length !== 1) { respond(false); return; }
      const actorId = actors[0];
      const mediaTypes = permission === "media" ? details.mediaTypes : undefined;
      if (permission === "media" && (!Array.isArray(mediaTypes) || !mediaTypes.length
        || mediaTypes.some(type => !["audio", "video"].includes(type)))) { respond(false); return; }
      const binding = { id, tab, leaseId: tab.control?.leaseId, actorId, ...document, generation, respond, permission, mediaTypes };
      binding.snapshot = { promptId: id, promptGeneration: generation, tabId: tab.id, tabGeneration: tab.generation,
        ...(binding.leaseId === undefined ? {} : { leaseId: binding.leaseId }),
        ...(actorId === undefined ? {} : { actorId }),
        rootUrl: contents.getURL(), frameUrl: document.frameUrl, requestingOrigin: document.frameOrigin,
        embeddingOrigin: document.frameOrigin, permissions: [permission],
        ...(mediaTypes === undefined ? {} : { mediaTypes: [...mediaTypes] }),
        requestingFrame: { processId: document.frame.processId, routingId: document.frame.routingId },
        presentation: "electron-permission-callback", variant: "main-frame-once",
        availableActions: ["allow-once", "block", "dismiss"] };
      this.permissionPrompts.set(id, binding); this.emit("permission-prompt", binding.snapshot);
    } catch (error) { respond(false); console.error("OpenCU permission request denied:", errorMessage(error)); }
  };
  assertPermissionDocument(binding) {
    if (binding.pluginPermission === true) return this.nativeProfile.assertCurrent(binding);
    const contents = binding.tab.view.webContents;
    if (this.closing || contents.isDestroyed() || this.tabs.get(binding.tab.id) !== binding.tab
      || this.permissionPrompts.get(binding.id) !== binding || !sameFrame(contents.mainFrame, binding.frame)
      || contents.mainFrame.url !== binding.frameUrl || contents.mainFrame.origin !== binding.frameOrigin
      || (binding.tab.documentGeneration ?? 0) !== binding.documentGeneration
      || binding.tab.control?.leaseId !== binding.leaseId || binding.actorId !== undefined && binding.tab.control?.stoppedActors.has(binding.actorId)) throw fail("Permission document or lease changed", "STALE_TARGET");
  }
  permissionKey(tab, permission, mediaType) { return JSON.stringify([tab.id, permission, mediaType ?? null]); }
  finishPermission(binding, allowed) {
    if (this.permissionPrompts.get(binding.id) !== binding) return;
    if (binding.pluginPermission === true) {
      if (allowed) throw fail("Permission decisions require their scoped response", "INVALID_ARGUMENT");
      return this.nativeProfile.dismiss(binding);
    }
    if (allowed) {
      this.assertPermissionDocument(binding);
      for (const mediaType of binding.mediaTypes ?? [undefined]) this.permissionGrants.set(
        this.permissionKey(binding.tab, binding.permission, mediaType), { ...binding });
    }
    binding.respond(allowed);
    this.permissionPrompts.delete(binding.id);
    this.emit("permission-prompt-closed", { tabId: binding.tab.id, promptId: binding.id, promptGeneration: binding.generation });
  }
  checkStockPermission = (contents, permission, requestingOrigin, details) => {
    try {
      const tab = contents && !contents.isDestroyed() ? this.tabs.get(contents.id) : undefined;
      if (this.closing || !tab || tab.view.webContents !== contents) return false;
      const document = this.permissionDocument(tab, details);
      if (!URL.canParse(requestingOrigin) || new URL(requestingOrigin).origin !== document.frameOrigin) return false;
      const grant = this.permissionGrants.get(this.permissionKey(tab, permission, details?.mediaType));
      return grant !== undefined && sameFrame(grant.frame, document.frame) && grant.frameUrl === document.frameUrl
        && grant.documentGeneration === document.documentGeneration && grant.leaseId === tab.control?.leaseId;
    } catch { return false; }
  };
  permissionOperation(method, value, signal) {
    if (method === "permissions.list") return [...this.permissionPrompts.values()]
      .filter(binding => value.tabId === undefined || binding.tab.id === numericId(value.tabId)).map(binding => ({ ...binding.snapshot }));
    if (!["permissions.respond", "permissions.openSystemSettings"].includes(method) || value.explicitUserCommand !== true) throw fail("Permission decisions require a real explicit user command");
    const tab = this.tab(numericId(value.tabId)), binding = this.permissionPrompts.get(identifier(value.promptId, "promptId"));
    if (!binding || binding.tab !== tab || binding.generation !== value.promptGeneration || binding.leaseId !== value.leaseId)
      throw fail("Permission prompt has ended", "STALE_TARGET");
    if (value.actorId !== undefined) this.assertControl(this.control(tab, value), identifier(value.actorId, "actorId"));
    this.assertPermissionDocument(binding); signal?.throwIfAborted();
    if (binding.pluginPermission === true) return this.nativeProfile.respond(binding, { ...value, method }, signal);
    if (method === "permissions.openSystemSettings") throw fail("Native permission settings are unavailable", "NATIVE_PERMISSION_UNAVAILABLE");
    const response = object(value.response);
    if (Object.keys(response).some(key => key !== "action") || !binding.snapshot.availableActions.includes(response.action)) throw fail("Unsupported permission decision");
    this.finishPermission(binding, response.action === "allow-once");
    return { accepted: true, promptId: binding.id, promptGeneration: binding.generation, closed: true };
  }
  rebindPermissionPrompts(tab) {
    for (const binding of [...this.permissionPrompts.values()]) if (binding.tab === tab) this.requestPermissionDismissal(binding);
    for (const [key, grant] of this.permissionGrants) if (grant.tab === tab) this.permissionGrants.delete(key);
  }
  downloadBinding(value) {
    const tab = this.tab(numericId(value.tabId)), control = this.control(tab, value), actorId = identifier(value.actorId, "actorId");
    this.assertControl(control, actorId); return { tab, control, actorId };
  }
  assertDownloadPermit(permit, value) {
    const binding = this.downloadBinding(value);
    if (permit.tab !== binding.tab || permit.leaseId !== binding.control.leaseId || permit.actorId !== binding.actorId
      || permit.rootUrl !== binding.tab.view.webContents.getURL()) throw fail("Download owner or document changed", "STALE_TARGET");
  }
  downloadUrl(value, rootUrl) {
    if (typeof value !== "string" || !URL.canParse(value)) throw fail("Invalid download source URL");
    const url = new URL(value);
    if (url.protocol !== "blob:") return this.navigation(value);
    const root = new URL(this.navigation(rootUrl));
    if (!["http:", "https:"].includes(root.protocol) || url.origin !== root.origin) throw fail("Blob download must belong to the current owned HTTP(S) root origin", "DOWNLOAD_SOURCE_DENIED");
    return url.href;
  }
  downloadSnapshot(download) {
    if (download.terminalSnapshot) return { ...download.terminalSnapshot, fileExists: existsSync(download.terminalSnapshot.path) };
    const item = download.item;
    return { id: download.id, idSource: "provider-live-item", permitId: download.permit.id,
      tabId: download.permit.tab.id, leaseId: download.permit.leaseId, actorId: download.permit.actorId,
      sourceUrl: download.sourceUrl, urlChain: [...download.urlChain], filename: download.filename,
      state: download.state, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(),
      startedAtMs: item.getStartTime() * 1000, updatedAtMs: download.updatedAtMs,
      paused: item.isPaused(), resumable: item.canResume(), path: item.getSavePath() || download.path,
      fileExists: existsSync(item.getSavePath() || download.path) };
  }
  acceptDownload(event, item, tab) {
    const chain = item.getURLChain(), sourceUrl = item.getURL();
    const permit = [...this.downloadPermits.values()].find(candidate => candidate.tab === tab && candidate.state === "armed"
      && candidate.leaseId === tab.control?.leaseId && !tab.control?.stopped && !tab.control?.stoppedActors.has(candidate.actorId)
      && candidate.rootUrl === tab.view.webContents.getURL() && (candidate.url === undefined || chain.includes(candidate.url)));
    if (!permit || !chain.length || this.downloads.size >= 1024) { event.preventDefault(); return; }
    try { for (const url of [...chain, sourceUrl]) this.downloadUrl(url, permit.rootUrl); }
    catch { event.preventDefault(); return; }
    const nativeGuid = this.options.downloadStore?.getCapabilities().nativeGuid === true;
    const id = nativeGuid ? item.getGUID?.() : randomUUID();
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(id))
      throw fail("The native download has no valid GUID", "INVALID_NATIVE_DOWNLOAD");
    const directory = join(this.options.downloadDirectory, id);
    const filename = basename(item.getFilename()).replace(/[\x00-\x1f]/gu, "_");
    if (!filename || filename === "." || filename === "..") { event.preventDefault(); return; }
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, filename), done = deferred();
    const download = { id, item, permit, path, filename, sourceUrl, urlChain: chain, state: "progressing", updatedAtMs: Date.now(), done };
    this.downloads.set(id, download); permit.state = "started"; permit.download = download; permit.started.resolve(download);
    item.on("updated", (_event, state) => {
      download.state = state; download.updatedAtMs = Date.now(); this.emit("download-updated", this.downloadSnapshot(download));
    });
    item.once("done", (_event, state) => {
      download.state = state; download.updatedAtMs = Date.now(); permit.state = state; const snapshot = this.downloadSnapshot(download);
      download.terminalSnapshot = snapshot;
      done.resolve(snapshot); this.emit("download-done", snapshot);
    });
    try {
      item.setSavePath(path);
      this.options.downloadStore?.attach(item, { id, tabId: tab.id, leaseId: permit.leaseId, actorId: permit.actorId,
        permitId: permit.id, sourceUrl, urlChain: chain, filename, savePath: path, rootUrl: permit.rootUrl, isActorVisit: true });
      this.emit("download-created", this.downloadSnapshot(download));
    }
    catch (error) { item.cancel(); throw error; }
  }
  async downloadOperation(method, value, signal, trustedUserAction = false) {
    if (this.options.downloadStore && (["downloads.getSnapshot", "downloads.pause", "downloads.resume", "downloads.cancel",
      "downloads.removeFromHistory", "downloads.open", "downloads.showInFolder", "downloads.acknowledge", "downloads.clearHistory", "downloads.showDownloadsFolder"].includes(method)
      || method === "downloads.action" && trustedUserAction)) return this.options.downloadStore.handle(method, value, { signal, trustedUserAction });
    if (["downloads.getHistory", "downloads.searchHistory", "downloads.removeFromHistory"].includes(method))
      return this.options.downloadStore === undefined ? Promise.reject(fail("Browser download store is not ready", "NATIVE_PROFILE_UNAVAILABLE"))
        : this.options.downloadStore.handle(method, value, { signal, trustedUserAction });
    if (method === "downloads.list") return [...this.downloads.values()]
      .filter(download => value.tabId === undefined || download.permit.tab.id === numericId(value.tabId)).map(download => this.downloadSnapshot(download));
    if (method === "downloads.arm") {
      const { tab, control, actorId } = this.downloadBinding(value), id = identifier(value.permitId, "permitId");
      if (this.downloadPermits.has(id) || this.downloadPermits.size >= 1024
        || [...this.downloadPermits.values()].some(permit => permit.tab === tab && permit.state === "armed")) throw fail("Download permit already exists or another intent is pending", "DOWNLOAD_BUSY");
      const url = value.url === undefined ? undefined : this.downloadUrl(value.url, tab.view.webContents.getURL());
      const permit = { id, tab, leaseId: control.leaseId, actorId, rootUrl: tab.view.webContents.getURL(), url,
        state: "armed", started: deferred() };
      this.downloadPermits.set(id, permit);
      return { armed: true, permitId: id };
    }
    if (["downloads.wait", "downloads.disarm"].includes(method)) {
      const id = identifier(value.permitId, "permitId"), permit = this.downloadPermits.get(id);
      if (!permit) throw fail("Unknown download permit", "STALE_DOWNLOAD");
      if (method === "downloads.disarm") {
        if (permit.tab.id !== numericId(value.tabId) || permit.leaseId !== identifier(value.leaseId, "leaseId") || permit.actorId !== identifier(value.actorId, "actorId")) throw fail("Download permit identity changed", "STALE_DOWNLOAD");
        await this.closeDownloadPermit(permit); return { released: true, permitId: id };
      }
      this.assertDownloadPermit(permit, value);
      const abort = deferred(), cancelled = () => abort.reject(signal.reason ?? fail("Download wait cancelled", "ABORTED"));
      signal?.addEventListener("abort", cancelled, { once: true });
      try {
        signal?.throwIfAborted();
        const download = await Promise.race([permit.started.promise, abort.promise]);
        const snapshot = await Promise.race([download.done.promise, abort.promise]);
        if (snapshot.state !== "completed") throw fail("Download did not complete: " + snapshot.state, "DOWNLOAD_FAILED");
        signal?.throwIfAborted(); this.assertDownloadPermit(permit, value); return snapshot;
      } finally { signal?.removeEventListener("abort", cancelled); }
    }
    if (method === "downloads.action") {
      const download = this.downloads.get(identifier(value.id, "download id"));
      if (!download) throw fail("Unknown download", "STALE_DOWNLOAD");
      this.assertDownloadPermit(download.permit, value); signal?.throwIfAborted();
      if (value.action === "cancel") await this.closeDownloadPermit(download.permit);
      else if (value.action === "pause" && download.state === "progressing") download.item.pause();
      else if (value.action === "resume" && download.item.canResume()) download.item.resume();
      else if (["open", "showInFolder"].includes(value.action) && value.explicitUserCommand === true && download.state === "completed") {
        const path = download.item.getSavePath();
        if (path !== download.path || !existsSync(path)) throw fail("The owned downloaded file is no longer available", "STALE_DOWNLOAD");
        if (value.action === "showInFolder") shell.showItemInFolder(path);
        else { const error = await shell.openPath(path); if (error) throw fail(error, "DOWNLOAD_OPEN_FAILED"); }
      }
      else throw fail("Download action is unavailable", "DOWNLOAD_ACTION_UNAVAILABLE");
      return this.downloadSnapshot(download);
    }
    throw fail("Unsupported live download operation", "UNSUPPORTED_OPERATION");
  }
  async closeDownloadPermit(permit) {
    if (permit.state === "armed") {
      permit.state = "cancelled"; permit.started.reject(fail("Download intent ended", "DOWNLOAD_CANCELLED"));
    } else if (permit.download && !["completed", "cancelled"].includes(permit.download.state)) {
      permit.download.item.cancel(); await resultWithin(permit.download.done.promise, "download cancellation");
    }
    this.emit("download-permit-closed", { permitId: permit.id, tabId: permit.tab.id, leaseId: permit.leaseId,
      actorId: permit.actorId, state: permit.state });
  }
  async releaseDownloads(tab, leaseId, actorId) {
    const results = await Promise.allSettled([...this.downloadPermits.values()].filter(permit =>
      (tab === undefined || permit.tab === tab) && (leaseId === undefined || permit.leaseId === leaseId)
      && (actorId === undefined || permit.actorId === actorId)).map(permit => this.closeDownloadPermit(permit)));
    const errors = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
    if (tab === undefined && leaseId === undefined && actorId === undefined) {
      const restored = await Promise.allSettled([...this.restoredDownloads.values()].map(async download => {
        if (download.item.getState() === "progressing") {
          download.item.cancel();
          if (download.item.getState() !== "cancelled") await resultWithin(download.done.promise, "restored download cancellation");
        }
      }));
      errors.push(...restored.flatMap(result => result.status === "rejected" ? [result.reason] : []));
    }
    if (errors.length) throw cleanupFailure(errors, "Native downloads remain pending");
  }
  tab(id) {
    const tab = this.tabs.get(id);
    if (tab === void 0 || tab.view.webContents.isDestroyed()) throw fail("page is not owned by this provider or has closed", "STALE_TAB");
    return tab;
  }
  describe(tab) {
    const contents = tab.view.webContents;
    return {
      id: tab.id,
      providerTabId: String(tab.id),
      title: contents.getTitle(),
      url: contents.getURL(),
      ...tab.mounted === void 0 ? {} : { windowId: tab.mounted.id },
      active: tab.visible,
      lastOpened: tab.createdAt,
      presentation: { visible: tab.visible, bounds: tab.visible ? tab.bounds ?? null : null },
      ...(tab.detached === undefined ? {} : { detached: this.detachedSnapshot(tab.detached) })
    };
  }
  emit(event, params) {
    if (this.closing) return;
    try {
      this.options.onEvent(event, params);
    } catch (error) {
      console.error("desktop computer use event listener:", error);
    }
  }
  invalidate(reason, tab) {
    this.emit("tabs-invalidated", { reason, tabId: tab.id });
  }
  listOwnedTabs() { return [...this.tabs.values()]; }
  resizeSourceWindow(window) {
    const size = window.getContentBounds();
    for (const tab of this.tabs.values()) if (tab.visible && tab.mounted === window && !tab.detached) {
      const bounds = { x: 0, y: 0, width: size.width, height: size.height };
      tab.view.setBounds(bounds); tab.bounds = bounds;
    }
  }
  hideSourceWindow(window) {
    for (const tab of this.tabs.values()) if (tab.mounted === window) {
      const size = tab.bounds ?? { width: 1280, height: 800 };
      this.move(tab, this.hidden(), { x: 0, y: 0, width: size.width, height: size.height }, false);
      this.emit("tab-presentation-changed", { tabId: tab.id, visible: false, bounds: null });
    }
  }
  detachedSnapshot(detached) {
    return { id: detached.id, windowId: detached.window?.id ?? null, sourceWindowId: detached.sourceWindow.id,
      phase: detached.phase, contentKind: "browser", alwaysOnTop: detached.window && !detached.window.isDestroyed() ? detached.window.isAlwaysOnTop() : null };
  }
  assertDetached(tab, id, preparing = false) {
    const detached = tab.detached;
    if (this.closing || this.tabs.get(tab.id) !== tab || tab.view.webContents.isDestroyed()
      || detached?.id !== id || !detached.window || detached.window.isDestroyed()
      || !["detached", ...(preparing ? ["preparing"] : [])].includes(detached.phase)) throw fail("Detached browser ownership has ended", "STALE_TARGET");
    return detached;
  }
  detachedRequest(tab, id) {
    const detached = this.assertDetached(tab, id, true), title = tab.view.webContents.getTitle() || "OpenCU Browser";
    return { content: { kind: "browser", tabId: tab.id }, title,
      chrome: { sourceTitle: "OpenCU Browser", locale: this.options.getLocale?.() ?? "en", direction: this.options.getDirection?.() ?? "ltr", appearance: this.options.getAppearance?.() ?? "light" },
      alwaysOnTop: detached.window.isAlwaysOnTop(), platform: process.platform, detached: this.detachedSnapshot(detached) };
  }
  detachedChanged(tab) {
    this.options.publishDetachedChrome?.(tab);
    this.emit("browser-detached-changed", { tabId: tab.id, detached: tab.detached ? this.detachedSnapshot(tab.detached) : null });
  }
  async detachTab(tab, value, signal) {
    return this.historyJob(() => this.performDetachTab(tab, value, signal));
  }
  async capturePresentedFrame(tab, window, signal) {
    const previous = tab.frameCaptureQueue ?? Promise.resolve();
    const work = previous.catch(() => {}).then(() => this.performCapturePresentedFrame(tab, window, signal));
    tab.frameCaptureQueue = work;
    try { return await work; } finally { if (tab.frameCaptureQueue === work) tab.frameCaptureQueue = undefined; }
  }
  async performCapturePresentedFrame(tab, window, signal) {
    const contents = tab.view.webContents, frame = deferred();
    const changed = () => frame.reject(fail("The native browser owner closed before a compositor frame", "STALE_TARGET"));
    const aborted = () => frame.reject(signal.reason ?? fail("Browser presentation cancelled", "ABORTED"));
    if (tab.mounted !== window || window.isDestroyed() || contents.isDestroyed()) throw fail("The browser is not mounted in its real native owner", "STALE_TARGET");
    signal?.throwIfAborted();
    contents.once("destroyed", changed); window.once("closed", changed); signal?.addEventListener("abort", aborted, { once: true });
    try {
      contents.beginFrameSubscription(false, image => { if (!image.isEmpty()) frame.resolve(); });
      if (!window.isVisible()) { window.setOpacity(0); window.showInactive(); }
      await resultWithin(frame.promise, "actual browser compositor frame");
      signal?.throwIfAborted();
      if (this.closing || tab.mounted !== window || window.isDestroyed() || contents.isDestroyed()) throw fail("The browser compositor owner changed", "STALE_TARGET");
      const image = await contents.capturePage(undefined, { stayHidden: true, stayAwake: true });
      if (image.isEmpty()) throw fail("The native browser compositor capture was empty", "PRESENTATION_REQUIRED");
      return image;
    } finally {
      signal?.removeEventListener("abort", aborted); window.removeListener("closed", changed);
      if (!contents.isDestroyed()) { contents.removeListener("destroyed", changed); contents.endFrameSubscription(); }
    }
  }
  captureTabPreview(tabId, { signal } = {}) {
    const previous = this.previewCaptureQueue;
    const job = this.historyJob(async () => {
      await previous;
      signal?.throwIfAborted();
      const tab = this.tab(numericId(tabId)), owner = tab.mounted;
      if (this.closing || tab.detached || !owner || owner.isDestroyed()) throw fail("The preview source has no current owned compositor owner", "STALE_TARGET");
      const visible = owner.isVisible(), opacity = owner.getOpacity();
      let failure;
      try {
        const image = await this.capturePresentedFrame(tab, owner, signal);
        signal?.throwIfAborted();
        if (this.tabs.get(tab.id) !== tab || tab.mounted !== owner || tab.detached) throw fail("The preview source moved during capture", "STALE_TARGET");
        return image;
      } catch (error) { failure = error; throw error; }
      finally {
        if (!owner.isDestroyed()) {
          try {
            const userPresented = [...this.tabs.values()].some(current => current.mounted === owner && current.visible);
            if (!visible && !userPresented) owner.hide();
            if (owner.getOpacity() === 0) owner.setOpacity(opacity);
            if (!visible && !userPresented && owner.isVisible() || owner.getOpacity() !== opacity) throw fail("The preview source window state was not restored", "PRESENTATION_RELEASE_FAILED");
          } catch (error) { throw failure ? cleanupFailure([failure, error], "Preview capture and source restoration failed") : error; }
        }
      }
    });
    this.previewCaptureQueue = job.then(() => {}, () => {}); return job;
  }
  async performDetachTab(tab, value, signal) {
    this.assertControl(this.control(tab, value), identifier(value.actorId, "actorId"));
    if (tab.detached) throw fail("This page is already detached", "TAB_BUSY");
    if (typeof this.options.createDetachedWindow !== "function") throw fail("Packaged browser chrome is unavailable", "BROWSER_CHROME_UNAVAILABLE");
    const sourceWindow = this.options.getWindow?.();
    if (!sourceWindow || sourceWindow.isDestroyed()) throw fail("The source browser window is unavailable", "PRESENTATION_REQUIRED");
    const detached = { id: randomUUID(), sourceWindow, phase: "preparing", sourceBounds: tab.bounds, window: undefined,
      leaseId: value.leaseId, actorId: value.actorId };
    tab.detached = detached;
    const cancelled = deferred(), abort = () => cancelled.reject(signal.reason ?? fail("Browser detachment cancelled", "ABORTED"));
    signal?.addEventListener("abort", abort, { once: true });
    try {
      signal?.throwIfAborted();
      const created = await this.options.createDetachedWindow(tab, detached);
      detached.window = created.window;
      await resultWithin(Promise.race([created.prepared, cancelled.promise]), "trusted browser chrome preparation");
      signal?.throwIfAborted(); this.assertControl(this.control(tab, value), identifier(value.actorId, "actorId"));
      this.assertDetached(tab, detached.id, true);
      if (tab.mounted !== detached.window || tab.bounds === undefined) throw fail("The browser view was not prepared in its real detached owner", "PRESENTATION_REQUIRED");
      await this.capturePresentedFrame(tab, detached.window, signal);
      signal?.throwIfAborted(); this.assertControl(this.control(tab, value), identifier(value.actorId, "actorId")); this.assertDetached(tab, detached.id, true);
      detached.phase = "detached"; detached.window.setOpacity(1); detached.window.show(); tab.view.webContents.focus(); this.detachedChanged(tab);
      return this.describe(tab);
    } catch (error) {
      if (tab.detached === detached && !tab.view.webContents.isDestroyed()) {
        const target = sourceWindow.isDestroyed() ? this.hidden() : sourceWindow, size = target.getContentBounds();
        this.move(tab, target, { x: 0, y: 0, width: size.width, height: size.height }, target === sourceWindow);
        tab.detached = undefined;
      }
      detached.phase = "closed"; if (detached.window && !detached.window.isDestroyed()) detached.window.destroy();
      throw error;
    } finally { signal?.removeEventListener("abort", abort); }
  }
  setDetachedContentBounds(tab, id, value, zoom) {
    const detached = this.assertDetached(tab, id, true), input = object(value), size = detached.window.getContentBounds();
    if (detached.phase === "preparing") this.assertControl(this.control(tab, detached), detached.actorId);
    if (!Number.isFinite(zoom) || zoom <= 0 || zoom > 5 || ![input.x, input.y, input.width, input.height].every(Number.isFinite)) throw fail("Invalid trusted renderer layout");
    const bounds = { x: Math.round(input.x * zoom), y: Math.round(input.y * zoom), width: Math.round(input.width * zoom), height: Math.round(input.height * zoom) };
    if (bounds.x < 0 || bounds.y < 0 || bounds.width <= 0 || bounds.height <= 0 || bounds.x + bounds.width > size.width || bounds.y + bounds.height > size.height) throw fail("Browser content must fit its actual native owner");
    this.move(tab, detached.window, bounds, true);
    const actual = tab.view.getBounds(); return Object.keys(bounds).every(key => actual[key] === bounds[key]);
  }
  focusDetachedSource(tab, id) {
    const detached = this.assertDetached(tab, id), source = detached.sourceWindow;
    if (source.isDestroyed()) return false;
    source.show(); source.focus();
    const active = [...this.tabs.values()].find(candidate => candidate !== tab && candidate.visible && candidate.mounted === source);
    (active?.view.webContents ?? source.webContents).focus();
    return source.isFocused() && (active?.view.webContents ?? source.webContents).isFocused();
  }
  focusDetachedWindow(tab, id) {
    const detached = this.assertDetached(tab, id), contents = tab.view.webContents;
    detached.window.show(); detached.window.focus(); contents.focus();
    return detached.window.isFocused() && contents.isFocused();
  }
  setDetachedAlwaysOnTop(tab, id, value) {
    if (typeof value !== "boolean") throw fail("Pinned state must be boolean");
    const detached = this.assertDetached(tab, id);
    detached.window.setAlwaysOnTop(value); const confirmed = detached.window.isAlwaysOnTop() === value;
    if (confirmed) this.detachedChanged(tab); return confirmed;
  }
  async restoreDetached(tab, id) {
    return this.historyJob(() => this.performRestoreDetached(tab, id));
  }
  async performRestoreDetached(tab, id) {
    const detached = this.assertDetached(tab, id), source = detached.sourceWindow;
    if (source.isDestroyed()) return "not-moved";
    const detachedBounds = tab.bounds, sourceVisible = source.isVisible(), sourceOpacity = source.getOpacity();
    detached.phase = "preparing-restore";
    try {
      // Retain the actual renderer; compositor captures are preparation and ready barriers.
      await this.capturePresentedFrame(tab, detached.window);
      if (this.closing || tab.detached !== detached || detached.window.isDestroyed() || tab.view.webContents.isDestroyed() || source.isDestroyed()) throw fail("The detached browser changed during restore", "STALE_TARGET");
      const size = source.getContentBounds();
      for (const other of this.tabs.values()) if (other !== tab && other.visible && other.mounted === source) this.move(other, this.hidden(), { x: 0, y: 0, width: 1280, height: 800 }, false);
      this.move(tab, source, { x: 0, y: 0, width: size.width, height: size.height }, true);
      await this.capturePresentedFrame(tab, source);
      if (tab.mounted !== source || tab.detached !== detached || source.isDestroyed() || tab.view.webContents.isDestroyed()) throw fail("Restored browser ownership is not confirmed", "STALE_TARGET");
      detached.phase = "restored"; tab.detached = undefined; detached.window.destroy();
      source.setOpacity(sourceVisible ? sourceOpacity : 1); source.show(); source.focus(); tab.view.webContents.focus(); this.detachedChanged(tab); return "moved";
    } catch (error) {
      if (!source.isDestroyed()) { if (!sourceVisible) source.hide(); source.setOpacity(sourceOpacity); }
      if (tab.detached === detached && !tab.view.webContents.isDestroyed() && !detached.window.isDestroyed() && detachedBounds) {
        try {
          this.move(tab, detached.window, detachedBounds, true);
          if (tab.mounted !== detached.window || Object.keys(detachedBounds).some(key => tab.view.getBounds()[key] !== detachedBounds[key])) throw fail("Detached restore rollback was not confirmed", "PRESENTATION_RELEASE_FAILED");
          detached.phase = "detached"; this.detachedChanged(tab);
        } catch (cleanup) { detached.phase = "restore-failed"; throw cleanupFailure([error, cleanup], "Browser restore and real view rollback failed"); }
      } else if (tab.detached === detached) detached.phase = "restore-failed";
      throw error;
    }
  }
  hidden() {
    if (this.hiddenWindow === void 0 || this.hiddenWindow.isDestroyed()) {
      const window = new BaseWindow({ show: false, width: 1280, height: 800, focusable: false, skipTaskbar: true });
      window.once("closed", () => {
        if (this.hiddenWindow === window) this.hiddenWindow = void 0;
        for (const tab of this.tabs.values()) if (tab.mounted === window) {
          tab.mounted = void 0;
          if (!this.closing) void this.closeTab(tab).catch((error) => {
            console.error("desktop computer use hidden window close:", error);
          });
        }
      });
      this.hiddenWindow = window;
    }
    return this.hiddenWindow;
  }
  move(tab, window, bounds, visible) {
    tab.removeWindowListener?.();
    tab.removeWindowListener = void 0;
    if (tab.mounted !== void 0 && !tab.mounted.isDestroyed()) tab.mounted.contentView.removeChildView(tab.view);
    window.contentView.addChildView(tab.view);
    tab.view.setBounds(bounds);
    tab.view.setVisible(true);
    tab.view.webContents.setBackgroundThrottling(false);
    tab.mounted = window;
    tab.bounds = bounds;
    tab.visible = visible;
    if (visible) {
      const closed = () => {
        tab.mounted = void 0;
        tab.visible = false;
        tab.removeWindowListener = void 0;
        if (!this.closing && !tab.view.webContents.isDestroyed()) {
          this.move(tab, this.hidden(), { x: 0, y: 0, width: bounds.width, height: bounds.height }, false);
          this.emit("tab-presentation-changed", { tabId: tab.id, visible: false, bounds: null });
        }
      };
      window.once("closed", closed);
      tab.removeWindowListener = () => {
        window.removeListener("closed", closed);
      };
    }
  }
  async createTab(url, allocated, agentActivity = null) {
    const view = new WebContentsView({ webPreferences: {
      session: this.browserSession,
      preload: fileURLToPath(new URL('../../lib/plugin-browser/annotation-preload.cjs', import.meta.url)),
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      plugins: false,
      navigateOnDragDrop: false,
      devTools: false,
      backgroundThrottling: false
    } });
    const contents = view.webContents;
    const tab = { id: contents.id, view, createdAt: (/* @__PURE__ */ new Date()).toISOString(), generation: ++this.generation, documentGeneration: 0, navigationSequence: 0, visible: false };
    this.tabs.set(tab.id, tab);
    this.setAgentActive(tab, agentActivity);
    allocated(tab);
    contents.setWindowOpenHandler(details => {
      if (this.authContainment.blocksPopup(tab)) { this.authContainment.rejectPopup(tab); return { action: "deny" }; }
      if (!this.closing && this.allowedNavigation(details.url)) {
        let popup;
        const source = { contents, documentGeneration: tab.documentGeneration, frame: contents.mainFrame };
        void this.createTab(this.navigation(details.url), created => { popup = created; created.authPopupSource = source; }, tab.agentActive).then(created => {
          this.emit("tab-updated", { ...this.describe(created), tabId: created.id, openerTabId: tab.id });
          if (tab.visible) this.showOwnedTab(created);
        }).catch(error => { console.error("OpenCU owned popup:", errorMessage(error)); });
      }
      return { action: "deny" };
    });
    contents.on("did-start-navigation", (details) => {
      if (details.isMainFrame) tab.navigationStart = { id: `${this.options.processInstanceId}:${tab.id}:${tab.generation}:start:${++tab.navigationSequence}`,
        url: details.url, agentActive: tab.agentActive, ambiguous: tab.navigationStart !== undefined,
        processId: details.frame?.processId ?? null, routingId: details.frame?.routingId ?? null };
      if (details.isSameDocument) return;
      if (details.isMainFrame) tab.documentGeneration++;
      const frame = details.frame;
      for (const binding of this.permissionPrompts.values()) if (binding.tab === tab && (details.isMainFrame || frame !== null && sameFrame(frame, binding.frame))) {
        try {
          this.requestPermissionDismissal(binding);
        } catch (error) {
          console.error("desktop native permission navigation:", error);
        }
      }
    });
    contents.on("did-redirect-navigation", details => { if (details.isMainFrame && tab.navigationStart) tab.navigationStart.url = details.url; });
    contents.on("did-fail-load", (_event, _code, _description, url, isMainFrame) => {
      if (isMainFrame && tab.navigationStart?.url === url) tab.navigationStart = undefined;
    });
    contents.on("will-frame-navigate", (event) => {
      if (!event.isMainFrame && this.authContainment.blocksPopup(tab)) { this.authContainment.rejectPopup(tab); event.preventDefault(); return; }
      if (event.isMainFrame ? !this.allowedNavigation(event.url) : !this.allowedSubframeNavigation(event.url)) event.preventDefault();
    });
    contents.on("will-redirect", (event, url2) => {
      if (!this.allowedNavigation(url2)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => {
      event.preventDefault();
    });
    contents.on("login", (event, _details, _authInfo, callback) => {
      event.preventDefault();
      callback();
    });
    const updated = () => {
      if (contents.isDestroyed() || this.tabs.get(tab.id) !== tab) return;
      if (tab.control !== void 0 && !tab.control.stopped) this.emit("tab-updated", { ...this.describe(tab), tabId: tab.id, leaseId: tab.control.leaseId });
      if (tab.detached?.phase === "detached") this.options.publishDetachedChrome?.(tab);
      this.invalidate("updated", tab);
    };
    contents.on("did-navigate", (_event, url, httpResponseCode) => { this.recordNavigation(tab, url, "electron-did-navigate", httpResponseCode); updated(); });
    contents.on("did-navigate-in-page", (_event, url, isMainFrame) => { if (isMainFrame) this.recordNavigation(tab, url, "electron-did-navigate-in-page"); updated(); });
    contents.on("page-title-updated", () => {
      if (this.options.history && tab.committedNavigationId) {
        const update = { navigationId: tab.committedNavigationId, title: contents.getTitle() };
        void this.historyJob(async () => {
          const result = await this.options.history.updateTitle(update);
          if (result.updated && !this.closing) this.emit("history-changed", { reason: "title", tabId: tab.id });
        });
      }
      updated();
    });
    contents.on("page-favicon-updated", (_event, faviconUrls) => {
      if (this.options.history && tab.committedNavigationId) {
        const update = { navigationId: tab.committedNavigationId, faviconUrls };
        void this.historyJob(async () => {
          const result = await this.options.history.updateFavicon(update);
          if (result.updated && !this.closing) this.emit("history-changed", { reason: "favicon", tabId: tab.id });
        });
      }
    });
    contents.on("render-process-gone", () => {
      if (tab.control !== void 0) this.lost(tab.control, "render-process-gone");
    });
    // Reapply after mounting/navigation so Electron updates the real owner
    // window and renderer widget, not only the initial preference value.
    contents.on("did-finish-load", () => contents.setBackgroundThrottling(false));
    contents.once("destroyed", () => {
      this.destroyedTabs.add(tab.id);
      this.authContainment.tabDestroyed(tab);
      tab.removeWindowListener?.();
      if (tab.control !== void 0) this.lost(tab.control, "tab-closed");
      if (this.tabs.get(tab.id) === tab) this.tabs.delete(tab.id);
      void this.dismissPermissionPrompts(tab).catch((error) => {
        console.error("desktop native permission destroyed tab:", error);
      });
      void this.releaseTabFiles(tab.id).catch((error) => {
        console.error("desktop computer use destroyed tab files:", error);
      });
      this.invalidate("removed", tab);
    });
    this.move(tab, this.hidden(), { x: 0, y: 0, width: 1280, height: 800 }, false);
    try {
      await contents.loadURL(url);
      if (this.closing || this.tabs.get(tab.id) !== tab || contents.isDestroyed()) throw fail("tab creation ended", "CONTROL_STOPPED");
      this.invalidate("created", tab);
      return tab;
    } catch (error) {
      await this.closeTab(tab);
      throw error;
    }
  }
  async create(value, signal, agentActivity = null) {
    const creationId = identifier(value.creationId, "creationId");
    if (this.issuedCreations.has(creationId)) throw fail("creationId was already requested");
    this.issuedCreations.add(creationId);
    const url = value.url === void 0 ? "about:blank" : this.navigation(value.url);
    let allocated;
    const ready = this.createTab(url, (tab) => {
      allocated = tab;
    }, agentActivity);
    const creation = { cancelled: false, committed: false, ready, ...allocated === void 0 ? {} : { tab: allocated } };
    this.creations.set(creationId, creation);
    const abort = () => {
      creation.cancelled = true;
      void this.cancelCreated(creation).catch((error) => {
        console.error("desktop computer use creation cancellation:", error);
      });
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const tab = await creation.ready;
      signal?.throwIfAborted();
      if (creation.cancelled || this.closing) {
        await this.closeTab(tab);
        throw fail("tab creation cancelled", "CONTROL_STOPPED");
      }
      return this.describe(tab);
    } catch (error) {
      try {
        await this.cancelCreated(creation);
      } catch (cleanupError) {
        throw cleanupFailure([error, cleanupError], "tab creation and cleanup failed");
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }
  async cancelCreated(creation) {
    creation.cancelled = true;
    if (creation.tab !== void 0 && !creation.tab.view.webContents.isDestroyed()) await this.closeTab(creation.tab);
    let tab;
    try {
      tab = await resultWithin(creation.ready, "cancelled tab creation");
    } catch (error) {
      if (creation.tab === void 0 || creation.tab.view.webContents.isDestroyed()) {
        this.forgetCreation(creation);
        return { released: true };
      }
      throw error;
    }
    if (tab.control !== void 0) await this.stop(tab.control, "creation-cancelled");
    await this.closeTab(tab);
    this.forgetCreation(creation);
    return { released: true };
  }
  forgetCreation(creation) {
    for (const [id, current] of this.creations) if (current === creation) this.creations.delete(id);
  }
  async cancelCreation(value) {
    const creation = this.creations.get(identifier(value.creationId, "creationId"));
    if (creation === void 0) return { released: true };
    if (creation.committed) throw fail("tab creation was already committed", "CONTROL_STOPPED");
    return this.cancelCreated(creation);
  }
  async commitCreation(value, signal) {
    const creation = this.creations.get(identifier(value.creationId, "creationId"));
    if (creation === void 0 || creation.cancelled) throw fail("tab creation ended", "CONTROL_STOPPED");
    const tab = await creation.ready;
    signal?.throwIfAborted();
    if (creation.cancelled || this.tabs.get(tab.id) !== tab) throw fail("tab creation ended", "CONTROL_STOPPED");
    creation.committed = true;
    this.forgetCreation(creation);
    return { committed: true };
  }
  assertExpected(tab, expected) {
    if (expected === void 0) return;
    const value = object(expected), current = this.describe(tab);
    for (const key of ["url", "title", "providerTabId"]) if (value[key] !== void 0 && value[key] !== current[key]) throw fail("page identity changed; inspect it again", "STALE_TAB");
    if (value.id !== void 0 && String(value.id) !== String(current.id)) throw fail("page identity changed", "STALE_TAB");
  }
  presentation(tab, value) {
    if (tab.detached) throw fail("Restore or use the actual detached browser window", "DETACHED_PRESENTATION");
    if (value.explicitUserCommand !== true || typeof value.visible !== "boolean") throw fail("presentation requires an explicit user command");
    if (value.leaseId !== void 0 || value.actorId !== void 0) {
      this.assertControl(this.control(tab, value), identifier(value.actorId, "actorId"));
    }
    if (!value.visible) {
      const size = tab.bounds ?? { width: 1280, height: 800 };
      this.move(tab, this.hidden(), { x: 0, y: 0, width: size.width, height: size.height }, false);
    } else {
      const window = this.options.getWindow?.();
      if (window === void 0 || window.isDestroyed()) throw fail("primary window is unavailable", "PRESENTATION_REQUIRED");
      const size = window.getContentBounds(), bounds = value.bounds === undefined ? { x: 0, y: 0, width: size.width, height: size.height } : object(value.bounds);
      const { x, y, width, height } = bounds;
      if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number" || ![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > size.width || y + height > size.height) throw fail("presentation bounds must fit the primary window");
      for (const other of this.tabs.values()) if (other !== tab && other.visible && !other.detached) {
        const otherSize = other.bounds ?? { width: 1280, height: 800 };
        this.move(other, this.hidden(), { x: 0, y: 0, width: otherSize.width, height: otherSize.height }, false);
        this.emit("tab-presentation-changed", { tabId: other.id, visible: false, bounds: null });
      }
      this.move(tab, window, { x, y, width, height }, true);
      window.show();
    }
    this.emit("tab-presentation-changed", { tabId: tab.id, visible: tab.visible, bounds: tab.visible ? tab.bounds ?? null : null });
    this.invalidate("presentation", tab);
    return this.describe(tab);
  }
  focus(tab, value) {
    this.assertExpected(tab, value.expected);
    if (tab.detached) {
      const detached = this.assertDetached(tab, tab.detached.id); detached.window.show(); detached.window.focus(); tab.view.webContents.focus(); return this.describe(tab);
    }
    const window = this.options.getWindow?.();
    if (window === void 0 || window.isDestroyed()) throw fail("browser window is unavailable", "PRESENTATION_REQUIRED");
    if (!tab.visible || tab.mounted !== window) this.showOwnedTab(tab);
    window.show();
    window.focus();
    tab.view.webContents.focus();
    this.invalidate("focused", tab);
    return this.describe(tab);
  }
  showOwnedTab(tab) {
    const window = this.options.getWindow?.();
    if (!window || window.isDestroyed()) throw fail("Browser owner window is unavailable", "PRESENTATION_REQUIRED");
    const size = window.getContentBounds();
    return this.presentation(tab, { explicitUserCommand: true, visible: true, bounds: { x: 0, y: 0, width: size.width, height: size.height } });
  }
  captureClipboard(tab, value, signal) {
    const pending = this.performCaptureClipboard(tab, value, signal);
    this.captures.add(pending);
    void pending.finally(() => {
      this.captures.delete(pending);
    }).catch((_error) => {
    });
    return pending;
  }
  async performCaptureClipboard(tab, value, signal) {
    if (value.explicitUserCommand !== true) throw fail("clipboard capture requires an explicit user command");
    const control = value.leaseId === void 0 ? void 0 : this.control(tab, value);
    const actorId = value.actorId === void 0 ? void 0 : identifier(value.actorId, "actorId");
    if (control !== void 0) this.assertControl(control, actorId);
    const image = await tab.view.webContents.capturePage(void 0, { stayHidden: !tab.visible, stayAwake: true });
    signal?.throwIfAborted();
    if (this.closing || this.tabs.get(tab.id) !== tab || tab.view.webContents.isDestroyed()) throw fail("page closed during capture", "STALE_TAB");
    if (control !== void 0) this.assertControl(control, actorId);
    const size = image.getSize(), png = image.toPNG(), bytes = png.byteLength;
    if (image.isEmpty() || size.width <= 0 || size.height <= 0 || size.width * size.height > MAX_CAPTURE_PIXELS || bytes > MAX_CAPTURE_BYTES) throw fail("captured image is empty or exceeds the clipboard limit", "CAPTURE_UNAVAILABLE");
    await clipboard.write([new ClipboardItem({ "image/png": new Blob([Uint8Array.from(png)], { type: "image/png" }) })]);
    return { copied: true, width: size.width, height: size.height, pngBytes: bytes };
  }
  async attach(tab, value, signal) {
    const leaseId = identifier(value.leaseId, "leaseId");
    if (this.issuedLeases.has(leaseId)) throw fail("leaseId was already issued; use a fresh binding", "CONTROL_STOPPED");
    if (tab.control !== void 0) throw fail("page already has an active lease", "TAB_BUSY");
    this.assertExpected(tab, value.expected);
    if (value.creationId !== void 0) {
      const creation = this.creations.get(identifier(value.creationId, "creationId"));
      if (creation === void 0 || creation.cancelled || await creation.ready !== tab) throw fail("page no longer belongs to this creation", "STALE_TAB");
      signal?.throwIfAborted();
      if (creation.cancelled) throw fail("page no longer belongs to this creation", "STALE_TAB");
      if (tab.control !== void 0) throw fail("page already has an active lease", "TAB_BUSY");
      if (this.issuedLeases.has(leaseId)) throw fail("leaseId was already issued; use a fresh binding", "CONTROL_STOPPED");
      this.assertExpected(tab, value.expected);
    }
    if (this.tabs.get(tab.id) !== tab || tab.view.webContents.isDestroyed() || this.closing) throw fail("tab creation ended", "CONTROL_STOPPED");
    const debuggerApi = tab.view.webContents.debugger;
    if (debuggerApi.isAttached()) throw fail("owned page debugger is already attached", "TAB_BUSY");
    let control;
    let listening = false;
    const message = (_event, method, params, sessionId) => {
      this.debuggerEvent(control, method, params, sessionId);
    };
    const detached = (_event, reason) => {
      this.lost(control, reason);
    };
    const removeListeners = () => {
      debuggerApi.removeListener("message", message);
      debuggerApi.removeListener("detach", detached);
      listening = false;
    };
    const installListeners = () => {
      if (listening) return;
      debuggerApi.on("message", message);
      debuggerApi.on("detach", detached);
      listening = true;
    };
    control = {
      tab,
      leaseId,
      generation: ++this.generation,
      tabGeneration: tab.generation,
      children: /* @__PURE__ */ new Map(),
      detachedChildren: /* @__PURE__ */ new Map(),
      sessionAliases: /* @__PURE__ */ new Map(),
      destroyedSessions: /* @__PURE__ */ new Set(),
      held: /* @__PURE__ */ new Map(),
      scripts: /* @__PURE__ */ new Map(),
      bindings: /* @__PURE__ */ new Map(),
      overrides: /* @__PURE__ */ new Map(),
      jobs: /* @__PURE__ */ new Set(),
      cleanupJobs: /* @__PURE__ */ new Set(),
      childRecoveries: /* @__PURE__ */ new Map(),
      stoppedActors: /* @__PURE__ */ new Set(),
      activeActors: new Set(),
      actorStops: /* @__PURE__ */ new Map(),
      actorErrors: /* @__PURE__ */ new Map(),
      removeListeners,
      installListeners,
      attached: Promise.resolve(),
      zoomQueue: Promise.resolve(),
      cleanupQueue: Promise.resolve(),
      stopped: false,
      detached: false,
      rootVerified: false
    };
    tab.control = control;
    this.issuedLeases.add(leaseId);
    control.installListeners();
    const abort = () => {
      void this.stop(control, "request-cancelled").catch((error) => {
        console.error("desktop computer use attachment cancellation:", error);
      });
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      debuggerApi.attach("1.3");
      control.attached = debuggerApi.sendCommand("Target.getTargetInfo");
      const result = object(await control.attached), targetInfo = object(result.targetInfo);
      signal?.throwIfAborted();
      if (typeof targetInfo.targetId !== "string" || !targetInfo.targetId || targetInfo.type !== "page") throw fail("owned page did not report a page target", "STALE_TARGET");
      control.targetInfo = targetInfo;
      control.rootVerified = true;
      this.assertControl(control);
      this.rebindPermissionPrompts(tab, leaseId);
      return { ...this.describe(tab), leaseId, targetId: targetInfo.targetId, targetInfo };
    } catch (error) {
      try {
        await this.stop(control, "attach-failed");
      } catch (cleanupError) {
        throw cleanupFailure([error, cleanupError], "attachment and cleanup failed");
      }
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }
  control(tab, value) {
    const control = tab.control;
    if (control === void 0 || control.leaseId !== identifier(value.leaseId, "leaseId")) throw fail("lease has ended; explicitly select the page again", "CONTROL_STOPPED");
    this.assertControl(control);
    return control;
  }
  assertControl(control, actorId) {
    const contents = control.tab.view.webContents;
    if (this.closing || this.tabs.get(control.tab.id) !== control.tab || control.tab.control !== control || control.tab.control.generation !== control.generation || control.tab.generation !== control.tabGeneration || control.stopped || control.detached || !control.rootVerified || contents.isDestroyed() || actorId !== void 0 && control.stoppedActors.has(actorId)) throw fail("control ended; queued operation cancelled", "CONTROL_STOPPED");
  }
  native(control, command) {
    if (command.method === "Network.setBypassServiceWorker" && command.params?.bypass === false
      && this.authContainment.forControl(control).length !== 0) {
      return Promise.reject(fail("private authentication owns service worker bypass until target protections are released", "TARGET_BUSY"));
    }
    const contents = control.tab.view.webContents;
    if (control.detached || contents.isDestroyed()) return Promise.reject(fail("debugger detached before cleanup completed", "INPUT_RELEASE_FAILED"));
    if (!contents.debugger.isAttached()) {
      this.lost(control, "debugger-disconnected");
      return Promise.reject(fail("debugger detached before cleanup completed", "INPUT_RELEASE_FAILED"));
    }
    return contents.debugger.sendCommand(command.method, command.params, command.sessionId);
  }
  scheduleCleanupNative(control, command, released) {
    const pending = this.native(control, command).then((result) => {
      released?.(result);
      return result;
    });
    control.cleanupJobs.add(pending);
    void pending.finally(() => {
      control.cleanupJobs.delete(pending);
    }).catch((_error) => {
    });
    return pending;
  }
  cleanupNative(control, command, released) {
    return resultWithin(this.scheduleCleanupNative(control, command, released), `cleanup ${command.method}`);
  }
  validateCommand(control, method, params, sessionId) {
    if (sessionId !== void 0 && !control.children.has(sessionId)) throw fail("child session is outside this lease", "STALE_TARGET");
    if (method.startsWith("Target.")) {
      if (!TARGET_COMMANDS.has(method)) throw fail("browser-wide target management is unavailable", "UNSUPPORTED_OPERATION");
      const targetIds = /* @__PURE__ */ new Set([control.targetInfo?.targetId, ...[...control.children.values()].map((child) => child.targetId)]);
      if (params.targetId !== void 0 && !targetIds.has(params.targetId)) throw fail("target is outside this lease", "STALE_TARGET");
      if (method === "Target.attachToTarget" && (params.flatten !== true || params.targetId === void 0 || params.targetId === control.targetInfo?.targetId)) throw fail("only known flat child targets may be attached", "STALE_TARGET");
      if (method === "Target.detachFromTarget" && (typeof params.sessionId !== "string" || !control.children.has(params.sessionId))) throw fail("child session is outside this lease", "STALE_TARGET");
      if (method === "Target.detachFromTarget" && [...control.jobs].some((job) => job.sessionId === params.sessionId) || method === "Target.detachFromTarget" && [...control.scripts.values(), ...control.bindings.values(), ...control.held.values()].some((effect) => effect.sessionId === params.sessionId) || method === "Target.detachFromTarget" && [...control.overrides.values()].some((effect) => effect.reset.sessionId === params.sessionId)) throw fail("release child input, scripts, and commands before detaching it", "TARGET_BUSY");
      if (method === "Target.setAutoAttach") {
        if (params.flatten !== true || typeof params.autoAttach !== "boolean" || typeof params.waitForDebuggerOnStart !== "boolean") throw fail("only explicit flat auto-attachment is supported");
        if (this.authContainment.protectsWorkers(control)) throw fail("private authentication owns target auto-attachment", "TARGET_BUSY");
        return { ...params, filter: [{ type: "iframe", exclude: false }, { exclude: true }] };
      }
      return params;
    }
    const [domain] = method.split(".");
    if (!SCOPED_DOMAINS.has(domain ?? "") || FORBIDDEN_COMMANDS.has(method)) throw fail(`unsupported scoped command: ${method}`, "UNSUPPORTED_OPERATION");
    if (method === "Page.navigate" || method === "Network.loadNetworkResource" || method === "Fetch.continueRequest" && params.url !== undefined) this.navigation(params.url);
    return params;
  }
  command(control, value, signal) {
    const method = identifier(value.method, "CDP method");
    if (!/^[A-Za-z]+\.[A-Za-z][A-Za-z0-9]*$/u.test(method)) throw fail("invalid CDP method");
    const actorId = value.actorId === void 0 && method === "Runtime.runIfWaitingForDebugger" ? "$frame-resume" : identifier(value.actorId, "actorId");
    const sessionId = value.sessionId === void 0 ? void 0 : identifier(value.sessionId, "sessionId");
    const params = this.validateCommand(control, method, value.params === void 0 ? {} : object(value.params), sessionId);
    if (this.authContainment.isPaused(control, sessionId)
      || method === "Target.detachFromTarget" && this.authContainment.isPaused(control, params.sessionId)) throw fail("private authentication target must be destroyed rather than operated or resumed", "TARGET_BUSY");
    this.assertControl(control, actorId);
    if (actorId !== "$frame-resume") control.activeActors.add(actorId);
    this.assertScriptOwnership(control, actorId, sessionId, method, params);
    if (method === "Runtime.addBinding") {
      const name = identifier(params.name, "binding name");
      control.bindings.set(JSON.stringify([sessionId ?? null, name]), { actorId, sessionId, name });
    }
    const abort = () => {
      void this.stopActor(control, actorId).catch((error) => {
        console.error("desktop computer use command cancellation:", error);
      });
    };
    signal?.addEventListener("abort", abort, { once: true });
    const promise = this.performCommand(control, actorId, sessionId, method, params, signal);
    const job = { actorId, sessionId, method, promise };
    control.jobs.add(job);
    void promise.finally(() => {
      control.jobs.delete(job);
      signal?.removeEventListener("abort", abort);
    }).catch((_error) => {
    });
    return promise;
  }
  async performCommand(control, actorId, sessionId, method, params, signal) {
    this.assertControl(control, actorId);
    signal?.throwIfAborted();
    let grant;
    let failure;
    try {
      if (method === "DOM.setFileInputFiles") {
        const transferId = params.opencuTransferId === undefined ? undefined : identifier(params.opencuTransferId, "opencuTransferId");
        const { opencuTransferId: _transfer, ...nativeParams } = params;
        params = nativeParams;
        if (!Array.isArray(params.files) || params.files.length > 128) throw fail("file upload requires at most 128 local paths");
        const files = params.files.map((path) => {
          if (typeof path !== "string" || path.length === 0 || path.length > 32768 || path.includes("\0") || !isAbsolute(path)) throw fail("file upload requires bounded absolute local paths");
          return path;
        });
        if (files.length) {
          if (transferId === undefined) throw fail("Native uploads require a one-shot file transfer receipt", "FILE_UPLOAD_TRANSFER_REQUIRED");
          if (sessionId !== undefined) throw fail("Out-of-process frame uploads are not supported by the file provider", "OOPIF_UPLOAD_UNAVAILABLE");
          if (this.options.authorizeFileUpload === void 0) throw fail("native file uploads require the host file policy", "FILE_UPLOAD_UNAVAILABLE");
          const identity = await this.uploadIdentity(control, actorId, sessionId, this.uploadSelector(params), signal);
          const request = { tabId: control.tab.id, leaseId: control.leaseId, actorId, files, ...identity,
            ...(transferId === undefined ? {} : { transferId }) };
          grant = await this.options.authorizeFileUpload(request, signal);
          if (grant.files.length !== files.length || grant.files.some((path) => !isAbsolute(path))) throw fail("host did not provide the approved native copies", "FILE_UPLOAD_UNAVAILABLE");
          await this.assertFileUploadRequest(request, signal);
          params = { backendNodeId: request.backendNodeId, files: [...grant.files] };
        }
      }
      const releasedKey = this.trackInput(control, actorId, sessionId, method, params);
      grant?.markDispatched();
      const result = await this.native(control, { method, params, sessionId });
      if (method === "Target.setAutoAttach" && sessionId === undefined) control.autoAttachConfig = params;
      if (releasedKey !== void 0) control.held.delete(releasedKey);
      await this.trackEffects(control, actorId, sessionId, method, params, result);
      signal?.throwIfAborted();
      this.assertControl(control, actorId);
      return result;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      if (grant !== void 0) {
        try {
          await grant.release();
        } catch (error) {
          throw cleanupFailure(failure === void 0 ? [error] : [failure, error], "approved file cleanup failed");
        }
      }
    }
  }
  uploadSelector(params) {
    const selectors = ["nodeId", "backendNodeId", "objectId"].filter((key2) => params[key2] !== void 0);
    if (selectors.length !== 1) throw fail("file upload requires exactly one native node selector", "INVALID_FILE_UPLOAD");
    const key = selectors[0];
    if (key === void 0) throw fail("file upload node selector is missing", "INVALID_FILE_UPLOAD");
    const value = params[key];
    if (key === "objectId") {
      if (typeof value !== "string" || value.length === 0 || value.length > 4096 || /[\x00-\x1f]/u.test(value)) throw fail("file upload object selector is invalid", "INVALID_FILE_UPLOAD");
    } else if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw fail("file upload node selector is invalid", "INVALID_FILE_UPLOAD");
    return { [key]: value };
  }
  async uploadIdentity(control, actorId, sessionId, selector, signal) {
    this.assertControl(control, actorId);
    const expectedTargetId = sessionId === void 0 ? control.targetInfo?.targetId : control.children.get(sessionId)?.targetId;
    if (typeof expectedTargetId !== "string") throw fail("upload target is not attached to this lease", "STALE_TARGET");
    const response = object(await this.native(control, { method: "Target.getTargetInfo", params: {}, sessionId })), target = object(response.targetInfo);
    signal?.throwIfAborted();
    this.assertControl(control, actorId);
    if (target.targetId !== expectedTargetId || typeof target.url !== "string" || typeof control.targetInfo?.targetId !== "string" || sessionId !== void 0 && control.children.get(sessionId)?.targetId !== expectedTargetId) throw fail("upload target changed", "STALE_TARGET");
    const rootUrl = control.tab.view.webContents.getURL();
    this.navigation(rootUrl);
    this.navigation(target.url);
    const document = await this.uploadDocument(control, sessionId, selector);
    signal?.throwIfAborted();
    this.assertControl(control, actorId);
    return { rootTargetId: control.targetInfo.targetId, rootUrl, targetId: expectedTargetId, ...sessionId === void 0 ? {} : { sessionId }, ...document };
  }
  async uploadDocument(control, sessionId, selector) {
    const described = object(await this.native(control, { method: "DOM.describeNode", params: { ...selector, depth: 0 }, sessionId })), input = object(described.node);
    const backendNodeId = input.backendNodeId;
    if (typeof backendNodeId !== "number" || !Number.isSafeInteger(backendNodeId) || backendNodeId <= 0 || input.nodeType !== 1 || input.localName !== "input") throw fail("upload selector is not a native input node", "INVALID_FILE_UPLOAD");
    const attributes = input.attributes;
    if (!Array.isArray(attributes) || !attributes.some((name, index) => index % 2 === 0 && name === "type" && typeof attributes[index + 1] === "string" && attributes[index + 1].toLowerCase() === "file")) throw fail("upload selector is not a native file input", "INVALID_FILE_UPLOAD");
    const snapshot = object(await this.native(control, { method: "DOMSnapshot.captureSnapshot", params: { computedStyles: [] }, sessionId }));
    if (!Array.isArray(snapshot.documents) || snapshot.documents.length > 4096 || !Array.isArray(snapshot.strings)) throw fail("native document snapshot is unavailable", "FILE_UPLOAD_UNAVAILABLE");
    const strings = snapshot.strings;
    const snapshotString = (value) => {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || typeof strings[value] !== "string") throw fail("native document snapshot identity is invalid", "FILE_UPLOAD_UNAVAILABLE");
      return strings[value];
    };
    let receiving;
    let count2 = 0;
    for (const value of snapshot.documents) {
      const document = object(value), nodes = object(document.nodes);
      if (!Array.isArray(nodes.backendNodeId)) throw fail("native document node identities are missing", "FILE_UPLOAD_UNAVAILABLE");
      count2 += nodes.backendNodeId.length;
      if (count2 > MAX_UPLOAD_SNAPSHOT_NODES) throw fail("native document snapshot exceeds the upload identity limit", "FILE_UPLOAD_UNAVAILABLE");
      if (!nodes.backendNodeId.includes(backendNodeId)) continue;
      const documentBackendNodeId = nodes.backendNodeId[0];
      if (receiving !== void 0 || !Array.isArray(nodes.nodeType) || nodes.nodeType[0] !== 9 || typeof documentBackendNodeId !== "number" || !Number.isSafeInteger(documentBackendNodeId) || documentBackendNodeId <= 0) throw fail("upload receiving document cannot be uniquely proven", "FILE_UPLOAD_UNAVAILABLE");
      const documentUrl = snapshotString(document.documentURL);
      if (!["about:blank", "about:srcdoc"].includes(documentUrl)) this.navigation(documentUrl);
      receiving = { frameId: identifier(snapshotString(document.frameId), "upload frameId"), url: documentUrl, documentBackendNodeId };
    }
    if (receiving === void 0) throw fail("upload input is not attached to a proven live document", "FILE_UPLOAD_UNAVAILABLE");
    const tree = object(await this.native(control, { method: "Page.getFrameTree", params: {}, sessionId })), frames = [object(tree.frameTree)];
    let match;
    let frameCount = 1;
    while (frames.length) {
      const item = frames.pop();
      if (item === void 0) break;
      const frame = object(item.frame);
      if (frame.id === receiving.frameId) {
        if (match !== void 0) throw fail("receiving frame is ambiguous", "FILE_UPLOAD_UNAVAILABLE");
        match = frame;
      }
      if (item.childFrames !== void 0) {
        if (!Array.isArray(item.childFrames)) throw fail("native frame tree is unavailable", "FILE_UPLOAD_UNAVAILABLE");
        for (const child of item.childFrames) {
          if (++frameCount > 4096) throw fail("native frame tree exceeds the upload identity limit", "FILE_UPLOAD_UNAVAILABLE");
          frames.push(object(child));
        }
      }
    }
    if (match === void 0 || typeof match.url !== "string" || typeof match.securityOrigin !== "string" || match.urlFragment !== void 0 && typeof match.urlFragment !== "string") throw fail("upload receiving frame cannot be proven", "FILE_UPLOAD_UNAVAILABLE");
    const frameUrl = match.url + (match.urlFragment ?? ""), inherited = ["about:blank", "about:srcdoc"].includes(receiving.url);
    if (!inherited) this.navigation(frameUrl);
    const origin = inherited ? new URL(this.navigation(match.securityOrigin)).origin : new URL(receiving.url).origin;
    if (frameUrl !== receiving.url || origin === "null" || match.securityOrigin !== origin) throw fail("upload document changed or has an opaque origin", "STALE_TARGET");
    return { ...receiving, backendNodeId, loaderId: identifier(match.loaderId, "upload loaderId"), origin };
  }
  inputKey(actorId, sessionId, kind, id) {
    return JSON.stringify([actorId, sessionId ?? null, kind, id]);
  }
  trackInput(control, actorId, sessionId, method, params) {
    if (method === "Input.dispatchMouseEvent") {
      if (params.type === "mouseMoved" && typeof params.x === "number" && typeof params.y === "number") {
        for (const input of control.held.values()) if (input.actorId === actorId && input.sessionId === sessionId && input.method === method) input.params = { ...input.params, x: params.x, y: params.y };
      }
      if (typeof params.button === "string" && params.button !== "none") {
        const key = this.inputKey(actorId, sessionId, "mouse", params.button);
        if (params.type === "mousePressed") control.held.set(key, { actorId, sessionId, method, params: { ...params, type: "mouseReleased", buttons: 0 } });
        if (params.type === "mouseReleased") return key;
      }
    }
    if (method === "Input.dispatchKeyEvent") {
      const key = this.inputKey(actorId, sessionId, "key", params.code ?? params.windowsVirtualKeyCode ?? params.key);
      if (params.type === "keyDown" || params.type === "rawKeyDown") {
        const { text: _text, unmodifiedText: _unmodifiedText, commands: _commands, ...release } = params;
        control.held.set(key, { actorId, sessionId, method, params: { ...release, type: "keyUp", modifiers: 0 } });
      }
      if (params.type === "keyUp") return key;
    }
    if (method === "Input.dispatchTouchEvent") {
      const key = this.inputKey(actorId, sessionId, "touch", null);
      if (params.type === "touchStart") control.held.set(key, { actorId, sessionId, method, params: { type: "touchCancel", touchPoints: [] } });
      if (params.type === "touchEnd" || params.type === "touchCancel") return key;
    }
    return void 0;
  }
  assertScriptOwnership(control, actorId, sessionId, method, params) {
    if (method === "Page.removeScriptToEvaluateOnNewDocument") {
      const key = JSON.stringify([sessionId ?? null, params.identifier]);
      if (control.scripts.get(key)?.actorId !== actorId) throw fail("script is not owned by this actor", "STALE_TARGET");
    }
    if (method === "Runtime.addBinding" || method === "Runtime.removeBinding") {
      const key = JSON.stringify([sessionId ?? null, identifier(params.name, "binding name")]), binding = control.bindings.get(key);
      if (binding !== void 0 && binding.actorId !== actorId || method === "Runtime.removeBinding" && binding === void 0) throw fail("binding is not owned by this actor", "STALE_TARGET");
    }
  }
  async trackEffects(control, actorId, sessionId, method, params, result) {
    sessionId = sessionId === void 0 ? void 0 : this.currentSession(control, sessionId);
    if (sessionId !== void 0 && control.destroyedSessions.has(sessionId)) return;
    if (method === "Page.addScriptToEvaluateOnNewDocument") {
      const identifier2 = object(result).identifier;
      if (typeof identifier2 !== "string" || !identifier2) throw fail("Chromium did not identify the installed script", "INPUT_RELEASE_FAILED");
      control.scripts.set(JSON.stringify([sessionId ?? null, identifier2]), { actorId, sessionId, identifier: identifier2 });
    }
    if (method === "Page.removeScriptToEvaluateOnNewDocument") control.scripts.delete(JSON.stringify([sessionId ?? null, params.identifier]));
    if (method === "Runtime.addBinding") {
      const name = identifier(params.name, "binding name");
      control.bindings.set(JSON.stringify([sessionId ?? null, name]), { actorId, sessionId, name });
    }
    if (method === "Runtime.removeBinding") control.bindings.delete(JSON.stringify([sessionId ?? null, params.name]));
    const override = OVERRIDE_COMMANDS.get(method);
    if (override !== void 0) {
      const key = JSON.stringify([sessionId ?? null, override.kind]), entry = control.overrides.get(key) ?? { kind: override.kind, reset: { ...override.reset, sessionId }, actors: /* @__PURE__ */ new Map() };
      entry.actors.delete(actorId);
      const clearing = method === "Emulation.clearDeviceMetricsOverride" || method === "Emulation.clearGeolocationOverride" || method === "Emulation.setUserAgentOverride" && params.userAgent === "" || method === "Emulation.setTouchEmulationEnabled" && params.enabled === false || method === "Emulation.setFocusEmulationEnabled" && params.enabled === false || method === "Emulation.setTimezoneOverride" && params.timezoneId === "";
      if (!clearing) entry.actors.set(actorId, { method, params, sessionId });
      if (entry.actors.size === 0) control.overrides.delete(key);
      else {
        control.overrides.set(key, entry);
        if (clearing) await this.cleanupNative(control, [...entry.actors.values()].at(-1) ?? entry.reset);
      }
    }
  }
  annotationPreloadIdentity(control, value, signal) {
    const actorId=identifier(value.actorId,"actorId"),expectedLoaderId=identifier(value.expectedLoaderId,"expectedLoaderId");
    if(Object.keys(value).some(key=>!["tabId","leaseId","actorId","expectedLoaderId"].includes(key)))throw fail("Invalid annotation preload query","INVALID_ARGUMENT");
    const promise=(async()=>{
      signal?.throwIfAborted();this.assertControl(control,actorId);
      const contents=control.tab.view.webContents,frame=contents.mainFrame;
      const before=await this.native(control,{method:"Page.getFrameTree",params:{}});
      if(before.frameTree?.frame?.loaderId!==expectedLoaderId)throw fail("Annotation document changed","STALE_TARGET");
      const identity=await contents.executeJavaScriptInIsolatedWorld(999,[{code:"(()=>{const value=globalThis[Symbol.for('opencu.annotation.site-controls.preload')];return value?.document===document?{token:value.token,registrationToken:value.registrationToken,siteUrl:location.href}:null})()"}],false);
      const after=await this.native(control,{method:"Page.getFrameTree",params:{}});
      signal?.throwIfAborted();this.assertControl(control,actorId);
      if(!sameFrame(frame,contents.mainFrame)||after.frameTree?.frame?.id!==before.frameTree.frame.id
        ||after.frameTree.frame.loaderId!==expectedLoaderId||typeof identity?.token!=="string"||!identity.token||identity.token.length>256
        ||typeof identity.registrationToken!=="string"||!identity.registrationToken||identity.registrationToken.length>256
        ||identity.siteUrl!==contents.mainFrame.url)throw fail("The annotation preload identity is unavailable or changed","ANNOTATION_SITE_CONTROLS_IDENTITY_CHANGED");
      return{token:identity.token,registrationToken:identity.registrationToken,frameId:before.frameTree.frame.id,frameLoaderId:expectedLoaderId,siteUrl:identity.siteUrl};
    })();
    const job={actorId,method:"annotation.preloadIdentity",promise};control.jobs.add(job);
    void promise.finally(()=>control.jobs.delete(job)).catch(()=>{});return promise;
  }
  zoom(control, value, signal) {
    const actorId = identifier(value.actorId, "actorId"), action = value.action ?? "get";
    if (value.sessionId !== void 0 || !["get", "set", "step", "reset"].includes(String(action)) || action === "set" && (typeof value.zoomPercent !== "number" || !Number.isFinite(value.zoomPercent)) || action === "step" && (typeof value.delta !== "number" || !Number.isFinite(value.delta)) || action !== "set" && value.zoomPercent !== void 0 || action !== "step" && value.delta !== void 0) throw fail("invalid zoom operation", "INVALID_ZOOM_ARGUMENT");
    const promise = control.zoomQueue.then(() => {
      signal?.throwIfAborted();
      this.assertControl(control, actorId);
      const contents = control.tab.view.webContents, current = zoomPercent(contents.getZoomFactor());
      let percent = current;
      if (action === "set") percent = Math.min(500, Math.max(25, Number(value.zoomPercent)));
      if (action === "reset") percent = 100;
      if (action === "step" && Number(value.delta) !== 0) percent = Number(value.delta) > 0 ? ZOOM_STEPS.find((step) => step > current) ?? 500 : [...ZOOM_STEPS].reverse().find((step) => step < current) ?? 25;
      if (action !== "get") contents.setZoomFactor(percent / 100);
      signal?.throwIfAborted();
      this.assertControl(control, actorId);
      const factor = contents.getZoomFactor();
      const result = { zoomPercent: zoomPercent(factor), zoomFactor: factor, zoomSettings: { mode: "automatic", scope: "per-origin", source: "electron-webContents" } };
      if (action !== "get") this.emit("tab-zoom-changed", { tabId: control.tab.id, leaseId: control.leaseId, ...result });
      return result;
    });
    control.zoomQueue = promise.catch((_error) => {
    });
    const job = { actorId, method: "tabs.zoom", promise };
    control.jobs.add(job);
    void promise.finally(() => {
      control.jobs.delete(job);
    }).catch((_error) => {
    });
    return promise;
  }
  debuggerEvent(control, method, raw, sessionId) {
    if (control.detached || control.tab.control !== control) return;
    try {
      const params = object(raw), parent = sessionId || "";
      if (parent && !control.children.has(parent) && (method !== "Target.targetDestroyed" || !control.detachedChildren.has(parent))) return;
      if (method === "Target.attachedToTarget") {
        const info = object(params.targetInfo), childId = identifier(params.sessionId, "child sessionId");
        if (this.authContainment.onAttached(control, params, parent)) {
          if (!control.stopped) this.emit("cdp", { tabId: control.tab.id, leaseId: control.leaseId, ...parent ? { sessionId: parent } : {}, method, params });
          return;
        }
        if (info.type !== "iframe" || typeof info.targetId !== "string" || !info.targetId) {
          void this.rejectChild(control, childId, params.waitingForDebugger === true).catch((error) => {
            console.error("desktop computer use rejected target cleanup:", error);
          });
          return;
        }
        control.children.set(childId, { targetId: info.targetId, parent, info });
        if (control.stopped && params.waitingForDebugger === true && !this.authContainment.isPaused(control, childId)) {
          void this.cleanupNative(control, { method: "Runtime.runIfWaitingForDebugger", params: {}, sessionId: childId }).catch((error) => {
            console.error("desktop computer use stopped frame resume:", error);
          });
        }
      }
      if (method === "Target.detachedFromTarget") {
        if (typeof params.sessionId !== "string" || !control.children.has(params.sessionId)) return;
        this.dropChild(control, params.sessionId);
      }
      if (method === "Target.targetInfoChanged" || method === "Target.targetCreated") {
        const info = object(params.targetInfo);
        if (info.targetId !== control.targetInfo?.targetId && ![...control.children.values()].some((child) => child.targetId === info.targetId)) return;
      }
      if (method === "Target.targetDestroyed") {
        this.authContainment.onDestroyed(control, params.targetId);
        const owned = [...control.children, ...control.detachedChildren].filter(([_id, child]) => child.targetId === params.targetId);
        if (params.targetId !== control.targetInfo?.targetId && !owned.length) return;
        for (const [id] of owned) this.dropChild(control, id, true);
      }
      if (!control.stopped) this.emit("cdp", { tabId: control.tab.id, leaseId: control.leaseId, ...parent ? { sessionId: parent } : {}, method, params });
    } catch (error) {
      console.error("desktop computer use debugger event:", error);
    }
  }
  async rejectChild(control, sessionId, waiting) {
    if (waiting) await this.cleanupNative(control, { method: "Runtime.runIfWaitingForDebugger", params: {}, sessionId });
    await this.cleanupNative(control, { method: "Target.detachFromTarget", params: { sessionId } });
  }
  dropChild(control, id, destroyed = false) {
    for (const [childId, child2] of [...control.children, ...control.detachedChildren]) if (child2.parent === id) this.dropChild(control, childId, destroyed);
    const child = control.children.get(id) ?? control.detachedChildren.get(id);
    control.children.delete(id);
    if (child !== void 0 && !destroyed) {
      control.detachedChildren.set(id, child);
      return;
    }
    control.detachedChildren.delete(id);
    control.destroyedSessions.add(id);
    for (const [key, script] of control.scripts) if (script.sessionId === id) control.scripts.delete(key);
    for (const [key, binding] of control.bindings) if (binding.sessionId === id) control.bindings.delete(key);
    for (const [key, override] of control.overrides) if (override.reset.sessionId === id) control.overrides.delete(key);
  }
  async releaseEffects(control, actorId) {
    const errors = [];
    if (control.detachedChildren.size) {
      try {
        await this.recoverForCleanup(control);
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    for (const [key, input] of control.held) if (actorId === void 0 || input.actorId === actorId) {
      const command = input.sessionId !== void 0 && !control.children.has(input.sessionId) ? { ...input, sessionId: void 0 } : input;
      try {
        await this.cleanupNative(control, command, () => {
          if (control.held.get(key) === input) control.held.delete(key);
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    for (const [key, script] of control.scripts) if (actorId === void 0 || script.actorId === actorId) {
      try {
        await this.cleanupNative(control, { method: "Page.removeScriptToEvaluateOnNewDocument", params: { identifier: script.identifier }, sessionId: script.sessionId }, () => {
          if (control.scripts.get(key) === script) control.scripts.delete(key);
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    for (const [key, binding] of control.bindings) if (actorId === void 0 || binding.actorId === actorId) {
      try {
        await this.cleanupNative(control, { method: "Runtime.removeBinding", params: { name: binding.name }, sessionId: binding.sessionId }, () => {
          if (control.bindings.get(key) === binding) control.bindings.delete(key);
        });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    for (const [key, override] of control.overrides) {
      if (actorId !== void 0 && !override.actors.has(actorId)) continue;
      const active = [...override.actors.keys()].at(-1), remaining = [...override.actors].filter(([id]) => actorId !== void 0 && id !== actorId);
      if (actorId === void 0 || active === actorId) {
        try {
          await this.cleanupNative(control, remaining.at(-1)?.[1] ?? override.reset);
        } catch (error) {
          errors.push(errorMessage(error));
          continue;
        }
      }
      override.actors = new Map(remaining);
      if (override.actors.size === 0) control.overrides.delete(key);
    }
    return errors;
  }
  async settleJobs(control, actorId) {
    const jobs = [...control.jobs].filter((job) => actorId === void 0 || job.actorId === actorId), errors = [];
    const sessions = new Set(jobs.filter((job) => actorId === void 0 && EVALUATION_COMMANDS.has(job.method)).map((job) => job.sessionId));
    for (const sessionId of sessions) {
      try {
        await this.cleanupNative(control, { method: "Runtime.terminateExecution", params: {}, sessionId });
      } catch (error) {
        errors.push(errorMessage(error));
      }
    }
    try {
      await settledWithin(jobs.map((job) => job.promise), "pending CDP commands");
    } catch (error) {
      errors.push(errorMessage(error));
    }
    return errors;
  }
  serializedCleanup(control, release) {
    const pending = control.cleanupQueue.then(release);
    control.cleanupQueue = pending.then(() => void 0, (_error) => void 0);
    return pending;
  }
  async recoverForCleanup(control) {
    if (!control.detached && control.rootVerified && !control.detachedChildren.size) return;
    const contents = control.tab.view.webContents;
    if (contents.isDestroyed()) throw fail("owned guest was destroyed before release was confirmed", "INPUT_RELEASE_FAILED");
    const previousChildren = control.detached || !control.rootVerified ? [...control.children, ...control.detachedChildren] : [...control.detachedChildren];
    if (control.detached || !control.rootVerified) {
      control.children.clear();
      for (const [sessionId, child] of previousChildren) control.detachedChildren.set(sessionId, child);
      control.installListeners();
      if (control.detached) {
        if (contents.debugger.isAttached()) throw fail("debugger ownership changed before cleanup", "INPUT_RELEASE_FAILED");
        contents.debugger.attach("1.3");
        control.detached = false;
      }
      control.rootVerified = false;
      try {
        const result = object(await this.cleanupNative(control, { method: "Target.getTargetInfo", params: {} })), info = object(result.targetInfo);
        if (info.targetId !== control.targetInfo?.targetId) throw fail("page target changed before cleanup", "INPUT_RELEASE_FAILED");
        control.rootVerified = true;
      } catch (error) {
        if (!contents.isDestroyed() && contents.debugger.isAttached()) {
          try {
            contents.debugger.detach();
          } catch (detachError) {
            throw cleanupFailure([error, detachError], "cleanup target verification and detachment failed");
          }
        }
        control.detached = true;
        throw error;
      }
    }
    for (const [oldSessionId, child] of previousChildren) {
      try {
        let pending = control.childRecoveries.get(child.targetId);
        if (pending === void 0) {
          pending = this.scheduleCleanupNative(control, { method: "Target.attachToTarget", params: { targetId: child.targetId, flatten: true } }, (result) => {
            this.remapChild(control, oldSessionId, child, identifier(object(result).sessionId, "cleanup child sessionId"));
          });
          const attachment = pending;
          control.childRecoveries.set(child.targetId, attachment);
          void attachment.finally(() => {
            if (control.childRecoveries.get(child.targetId) === attachment) control.childRecoveries.delete(child.targetId);
          }).catch((_error) => {
          });
        }
        const attached = object(await resultWithin(pending, "child cleanup attachment"));
        this.remapChild(control, oldSessionId, child, identifier(attached.sessionId, "cleanup child sessionId"));
      } catch (error) {
        if (/No target with given id/u.test(errorMessage(error))) {
          this.dropChild(control, oldSessionId, true);
          continue;
        }
        throw error;
      }
    }
  }
  currentSession(control, id) {
    while (control.sessionAliases.has(id)) {
      const replacement = control.sessionAliases.get(id);
      if (replacement === void 0 || replacement === id) break;
      id = replacement;
    }
    return id;
  }
  remapChild(control, oldId, child, newId) {
    const current = this.currentSession(control, oldId), replaced = /* @__PURE__ */ new Set([oldId, current]);
    control.sessionAliases.delete(newId);
    if (oldId !== newId) control.sessionAliases.set(oldId, newId);
    if (current !== newId) control.sessionAliases.set(current, newId);
    control.children.set(newId, { ...child, parent: this.currentSession(control, child.parent) });
    for (const id of replaced) {
      if (id !== newId) control.children.delete(id);
      control.detachedChildren.delete(id);
    }
    for (const descendant of [...control.children.values(), ...control.detachedChildren.values()]) if (replaced.has(descendant.parent)) descendant.parent = newId;
    for (const input of control.held.values()) if (input.sessionId !== void 0 && replaced.has(input.sessionId)) input.sessionId = newId;
    for (const [key, script] of control.scripts) if (script.sessionId !== void 0 && script.sessionId !== newId && replaced.has(script.sessionId)) {
      script.sessionId = newId;
      control.scripts.delete(key);
      control.scripts.set(JSON.stringify([newId, script.identifier]), script);
    }
    for (const [key, binding] of control.bindings) if (binding.sessionId !== void 0 && binding.sessionId !== newId && replaced.has(binding.sessionId)) {
      binding.sessionId = newId;
      control.bindings.delete(key);
      control.bindings.set(JSON.stringify([newId, binding.name]), binding);
    }
    for (const [key, override] of control.overrides) if (override.reset.sessionId !== void 0 && override.reset.sessionId !== newId && replaced.has(override.reset.sessionId)) {
      override.reset.sessionId = newId;
      for (const actor of override.actors.values()) actor.sessionId = newId;
      control.overrides.delete(key);
      control.overrides.set(JSON.stringify([newId, override.kind]), override);
    }
  }
  async stopActor(control, actorId) {
    const previous = control.actorStops.get(actorId);
    if (previous !== void 0) return previous;
    if (control.stopping !== void 0) return control.stopping;
    control.stoppedActors.add(actorId);
    control.activeActors.delete(actorId);
    const stopping = this.serializedCleanup(control, async () => {
      await this.authContainment.releaseControl(control, actorId);
      await this.releaseDownloads(control.tab, control.leaseId, actorId);
      await this.dismissPermissionPrompts(control.tab, control.leaseId, actorId);
      if ((control.detached || !control.rootVerified) && (control.held.size || control.scripts.size || control.bindings.size || control.overrides.size)) await this.recoverForCleanup(control);
      const errors = [...await this.settleJobs(control, actorId), ...await this.releaseEffects(control, actorId)];
      try {
        await settledWithin([...control.cleanupJobs], "native actor cleanup");
      } catch (error) {
        errors.push(errorMessage(error));
      }
      if (errors.length) {
        control.actorErrors.set(actorId, errors);
        this.emit("actor-stopped", { tabId: control.tab.id, leaseId: control.leaseId, actorId, released: false, errors });
        throw fail(errors.join("; "), "INPUT_RELEASE_FAILED");
      }
      control.actorErrors.delete(actorId);
      this.emit("actor-stopped", { tabId: control.tab.id, leaseId: control.leaseId, actorId, released: true });
      return { released: true };
    });
    control.actorStops.set(actorId, stopping);
    try {
      return await stopping;
    } finally {
      if (control.actorStops.get(actorId) === stopping) control.actorStops.delete(actorId);
    }
  }
  async stop(control, reason) {
    if (control.stopping !== void 0) return control.stopping;
    control.stopped = true;
    const stopping = this.serializedCleanup(control, async () => {
      await this.authContainment.releaseControl(control);
      await this.releaseDownloads(control.tab, control.leaseId);
      if (!this.closing) await this.dismissPermissionPrompts(control.tab, control.leaseId);
      await settledWithin([control.attached], "debugger attachment");
      await settledWithin([...control.actorStops.values()], "actor release");
      if ((control.detached || !control.rootVerified) && (control.held.size || control.scripts.size || control.bindings.size || control.overrides.size)) await this.recoverForCleanup(control);
      const errors = [...await this.settleJobs(control), ...await this.releaseEffects(control)];
      try {
        await settledWithin([...control.cleanupJobs], "native lease cleanup");
      } catch (error) {
        errors.push(errorMessage(error));
      }
      if (control.detached && (control.held.size || control.scripts.size || control.bindings.size || control.overrides.size)) errors.push("debugger detached before resource release was confirmed");
      if (errors.length) {
        this.emit("stopped", { tabId: control.tab.id, leaseId: control.leaseId, reason, released: false, errors });
        throw fail(errors.join("; "), "INPUT_RELEASE_FAILED");
      }
      control.removeListeners();
      const contents = control.tab.view.webContents;
      if (contents && !contents.isDestroyed() && contents.debugger.isAttached()) contents.debugger.detach();
      control.detached = true;
      if (control.tab.control === control) control.tab.control = void 0;
      this.ended.set(control.leaseId, { tabId: control.tab.id, released: true, errors: [] });
      this.emit("stopped", { tabId: control.tab.id, leaseId: control.leaseId, reason, released: true, errors: [] });
      return { released: true };
    });
    control.stopping = stopping;
    try {
      return await stopping;
    } finally {
      if (control.stopping === stopping) control.stopping = void 0;
    }
  }
  lost(control, reason) {
    if (control.detached) return;
    control.stopped = true;
    control.detached = true;
    control.rootVerified = false;
    control.removeListeners();
    const errors = [];
    void this.dismissPermissionPrompts(control.tab, control.leaseId).catch((error) => {
      console.error("desktop native permission lost lease:", error);
    });
    const released = errors.length === 0 && control.held.size === 0 && control.scripts.size === 0 && control.bindings.size === 0 && control.overrides.size === 0 && control.jobs.size === 0 && control.cleanupJobs.size === 0 && ![...this.permissionLifecycles].some((life) => life.tab === control.tab && life.leaseId === control.leaseId);
    if (!released) errors.push("debugger detached before input, scripts, permissions, and pending commands were confirmed released");
    this.ended.set(control.leaseId, { tabId: control.tab.id, released, errors, control, reason });
    if (released && control.tab.control === control) control.tab.control = void 0;
    this.emit("stopped", { tabId: control.tab.id, leaseId: control.leaseId, reason, released, errors });
  }
  releaseDestroyedControl(control) {
    if (control.destroyedRelease) return control.destroyedRelease;
    const pending = (async () => {
      const contents = control.tab.view.webContents;
      if (!this.destroyedTabs.has(control.tab.id)) {
        if (!contents) throw fail("owned guest destruction was not observed", "INPUT_RELEASE_FAILED");
        let destroyed;
        try {
          await resultWithin(new Promise(resolve => {
            destroyed = resolve; contents.once("destroyed", destroyed);
            if (this.destroyedTabs.has(control.tab.id)) resolve();
          }), "owned guest destruction");
        } finally { contents.removeListener("destroyed", destroyed); }
      }
      if (!this.destroyedTabs.has(control.tab.id)) throw fail("owned guest destruction was not observed", "INPUT_RELEASE_FAILED");
      await settledWithin([...control.jobs].map(job => job.promise), "destroyed guest commands");
      await settledWithin([...control.cleanupJobs], "destroyed guest cleanup");
      const confined = effect => effect.sessionId === undefined || control.destroyedSessions.has(effect.sessionId)
        || (control.children.get(effect.sessionId) ?? control.detachedChildren.get(effect.sessionId))?.info?.type === "iframe";
      const effects = [...control.held.values(), ...control.scripts.values(), ...control.bindings.values(),
        ...[...control.overrides.values()].flatMap(override => [...override.actors.values(), override.reset])];
      if (effects.some(effect => !confined(effect)) || [...this.authContainment.targets.values()].some(target => target.control === control && !target.destroyed))
        throw fail("non-page effects remain after guest destruction", "INPUT_RELEASE_FAILED");
      await this.authContainment.releaseControl(control);
      await this.releaseDownloads(control.tab, control.leaseId);
      await this.dismissPermissionPrompts(control.tab, control.leaseId);
      await this.releaseTabFiles(control.tab.id);
      // Only observed destruction proves these page-local effects cannot run.
      control.held.clear(); control.scripts.clear(); control.bindings.clear(); control.overrides.clear();
      control.removeListeners();
      if (control.tab.control === control) control.tab.control = undefined;
      this.ended.set(control.leaseId, { tabId: control.tab.id, released: true, errors: [] });
      this.emit("stopped", { tabId: control.tab.id, leaseId: control.leaseId, reason: "tab-closed", tabClosed: true, released: true, errors: [] });
      return { released: true };
    })();
    control.destroyedRelease = pending;
    void pending.catch(() => { if (control.destroyedRelease === pending) control.destroyedRelease = undefined; });
    return pending;
  }
  async closeTab(tab) {
    if (tab.closing !== void 0) return tab.closing;
    const contents = tab.view.webContents;
    if (!contents || contents.isDestroyed()) {
      if (!contents && !this.destroyedTabs.has(tab.id)) throw fail("owned guest destruction was not observed", "INPUT_RELEASE_FAILED");
      await this.releaseTabFiles(tab.id);
      return;
    }
    const pending = Promise.resolve().then(async () => {
      if (tab.control !== void 0) await this.stop(tab.control, "tab-closed");
      await this.releaseDownloads(tab);
      if (contents.isDestroyed()) {
        await this.releaseTabFiles(tab.id);
        return;
      }
      tab.removeWindowListener?.();
      tab.removeWindowListener = void 0;
      if (tab.mounted !== void 0 && !tab.mounted.isDestroyed()) tab.mounted.contentView.removeChildView(tab.view);
      tab.mounted = void 0;
      tab.visible = false;
      const destroyed = new Promise((resolveDestroyed) => {
        contents.once("destroyed", resolveDestroyed);
      });
      contents.close({ waitForBeforeUnload: false });
      await settledWithin([destroyed], "owned guest destruction");
      await this.dismissPermissionPrompts(tab);
      await this.releaseTabFiles(tab.id);
      if (tab.detached) {
        const detached = tab.detached; detached.phase = "closed"; tab.detached = undefined;
        if (!detached.window.isDestroyed()) detached.window.destroy();
      }
    });
    tab.closing = pending;
    try {
      await pending;
    } finally {
      if (tab.closing === pending) tab.closing = void 0;
    }
  }
  releaseTabFiles(tabId) {
    if (this.options.releaseFileUploadsForTab === void 0) return Promise.resolve();
    const previous = this.tabFileCleanups.get(tabId);
    if (previous !== void 0) return previous;
    this.fileCleanupTabs.add(tabId);
    const pending = this.options.releaseFileUploadsForTab(tabId).then(() => {
      this.fileCleanupTabs.delete(tabId);
    });
    this.tabFileCleanups.set(tabId, pending);
    void pending.finally(() => {
      if (this.tabFileCleanups.get(tabId) === pending) this.tabFileCleanups.delete(tabId);
    }).catch((_error) => {
    });
    return pending;
  }
  configureSession() {
    const browserSession = this.browserSession;
    // The persisted permission service is installed after its initialization.
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setDevicePermissionHandler(() => false);
    browserSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    browserSession.on("will-download", this.receiveDownload);
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      if (this.closing || !URL.canParse(details.url)) { callback({ cancel: true }); return; }
      const url = new URL(details.url), network = ["http:", "https:", "ws:", "wss:"].includes(url.protocol);
      callback({ cancel: network ? this.options.hostUrl() === undefined || url.username !== "" || url.password !== "" || this.isApplicationHost(url)
        : !["about:", "data:", "blob:"].includes(url.protocol) });
    });
  }
  navigation(value) {
    if (typeof value === "string" && URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol) && this.options.hostUrl() === void 0) {
      throw fail("authenticated host URL is not ready; external networking is disabled", "HOST_NOT_READY");
    }
    if (typeof value !== "string" || !this.allowedNavigation(value)) throw fail("only HTTP(S) and inert about:blank navigation are allowed");
    return new URL(value).href;
  }
  allowedNavigation(value) {
    if (value === "about:blank") return true;
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.username === "" && url.password === "" && !this.isApplicationHost(url);
  }
  allowedSubframeNavigation(value) {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return ["about:", "data:", "blob:"].includes(url.protocol) || this.allowedNavigation(value);
  }
  isApplicationHost(url) {
    const value = this.options.hostUrl();
    if (value === void 0) return true;
    if (!URL.canParse(value)) return true;
    const host = new URL(value);
    if (effectivePort(url) !== effectivePort(host)) return false;
    const targetHost = hostname(url), applicationHost = hostname(host);
    return loopback(applicationHost) || targetHost === applicationHost || loopback(targetHost);
  }
}
export {
  DesktopComputerUseBrowser
};
