// native/plugin-browser/annotation-preload.mjs
var import_electron = require("electron");

// src/computer-use/annotation-surface-registry.mjs
function installAnnotationSurfaceRegistry() {
  if (window !== window.top || !globalThis.isSecureContext) return false;
  const events = { request: "codex:annotation-surface-request", response: "codex:annotation-surface-response", remove: "codex:annotation-surfaces-remove", available: "codex:annotation-surface-available" }, busy = Symbol.for("codex:annotation-surface-pending");
  const surfaces = /* @__PURE__ */ new Map(), documentId = crypto.randomUUID();
  let active = null, pending = null, disposed = false, nextId = 0;
  let oai, annotation, ownOai = false, ownAnnotation = false;
  try {
    oai = Reflect.get(document, "oai");
    if (oai != null && typeof oai !== "object" && typeof oai !== "function") return false;
    if (oai == null) {
      oai = {};
      if (!Reflect.defineProperty(document, "oai", { configurable: true, enumerable: false, value: oai })) return false;
      ownOai = true;
    }
    annotation = Reflect.get(oai, "annotation");
    if (annotation != null && (typeof annotation !== "object" || Reflect.has(annotation, "registerSurface"))) return false;
    if (annotation == null) {
      annotation = {};
      if (!Reflect.defineProperty(oai, "annotation", { configurable: true, enumerable: false, value: annotation })) return false;
      ownAnnotation = true;
    }
  } catch {
    return false;
  }
  const validElement = (node) => node instanceof HTMLElement && !(node instanceof HTMLIFrameElement) && node.isConnected && node.ownerDocument === document && node.getRootNode() === document;
  const validString = (value) => typeof value === "string" && value.length > 0 && value.length <= 128 && /^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(value);
  const validNullableId = (value) => value === null || validString(value);
  const plain = (value, maxKeys) => {
    if (typeof value !== "object" || !value) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const properties = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(properties);
    if (keys.length > maxKeys || keys.some((key) => typeof key !== "string")) return null;
    const result = /* @__PURE__ */ Object.create(null);
    for (const [key, property] of Object.entries(properties)) {
      if (!property.enumerable || !Object.hasOwn(property, "value") || ["__proto__", "constructor", "prototype"].includes(key)) return null;
      result[key] = property.value;
    }
    return result;
  };
  const sanitizeHit = (value) => {
    if (value === null) return null;
    try {
      const input = plain(value, 5);
      if (input == null || !validString(input.id)) return void 0;
      const hit = { id: input.id };
      if (typeof input.name === "string" && input.name.trim().length > 0 && input.name.length <= 128 && /^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(input.name)) hit.name = input.name;
      if (typeof input.role === "string" && input.role.length <= 64 && /^[a-z][a-z0-9-]*(?![\s\S])/.test(input.role)) hit.role = input.role;
      if (input.rect !== void 0) {
        const rect = plain(input.rect, 4);
        if (rect == null || !["x", "y", "width", "height"].every((key) => typeof rect[key] === "number" && Number.isFinite(rect[key])) || rect.width <= 0 || rect.height <= 0) return void 0;
        hit.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
      const metadata = plain(input.metadata, 6);
      if (metadata != null && Object.entries(metadata).every(([key, value2]) => key.length <= 64 && /^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key) && (value2 === null || typeof value2 === "boolean" || typeof value2 === "number" && Number.isFinite(value2) || typeof value2 === "string" && value2.length <= 256 && /^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(value2)))) {
        const serialized = JSON.stringify(metadata);
        if (new TextEncoder().encode(serialized).byteLength <= 2048) hit.metadata = JSON.parse(serialized);
      }
      return hit;
    } catch {
      return void 0;
    }
  };
  const emit = (registration, type, requestId, hit) => registration.options.element.dispatchEvent(new CustomEvent(events.response, { bubbles: true, detail: JSON.stringify({ type, registrationId: registration.id, customRendering: registration.options.renderSelection != null && !registration.renderFailed, requestId, hit }) }));
  const renderFailed = (registration) => {
    if (!registration.renderFailed) {
      registration.renderFailed = true;
      render(registration, { hoveredId: null, selectedId: null });
      emit(registration, "rendering-failed");
    }
  };
  const render = (registration, selection) => {
    const callback = registration.options.renderSelection;
    if (callback == null || registration.renderFailed && (selection.hoveredId != null || selection.selectedId != null) || registration.selection.hoveredId === selection.hoveredId && registration.selection.selectedId === selection.selectedId) return;
    registration.selection = selection;
    try {
      const result = callback({ ...selection });
      if (result != null) Promise.resolve(result).catch(() => renderFailed(registration));
    } catch {
      renderFailed(registration);
    }
  };
  const cancelActive = () => {
    if (active == null || active.answered) return;
    active.answered = true;
    clearTimeout(active.timer);
    active.controller.abort();
    emit(active.registration, "result", active.requestId);
  };
  const cancelPending = () => {
    if (pending == null) return;
    const previous = pending;
    pending = null;
    clearTimeout(previous.timer);
    emit(previous.registration, "result", previous.requestId);
  };
  const disposeRegistration = (registration) => {
    surfaces.delete(registration.options.element);
    if (active?.registration === registration) cancelActive();
    if (pending?.registration === registration) cancelPending();
    render(registration, { hoveredId: null, selectedId: null });
    emit(registration, "disposed");
  };
  const complete = (request, value) => {
    clearTimeout(request.timer);
    if (active !== request) return;
    if (performance.now() >= request.deadline) cancelActive();
    active = null;
    if (Reflect.getOwnPropertyDescriptor(document, busy)?.value === documentId) Reflect.deleteProperty(document, busy);
    if (request.answered) {
      if (pending == null) {
        if (!disposed && surfaces.get(request.registration.options.element) === request.registration) emit(request.registration, "invalidated");
      } else pump();
    } else {
      request.answered = true;
      emit(request.registration, "result", request.requestId, sanitizeHit(value));
      pump();
    }
    document.dispatchEvent(new Event(events.available));
  };
  const pump = () => {
    if (active != null || pending == null || Reflect.getOwnPropertyDescriptor(document, busy) != null) return;
    const waiting = pending;
    pending = null;
    clearTimeout(waiting.timer);
    const remaining = waiting.deadline - performance.now();
    if (remaining <= 0 || !Reflect.defineProperty(document, busy, { configurable: true, value: documentId })) {
      emit(waiting.registration, "result", waiting.requestId);
      return;
    }
    const request = { registration: waiting.registration, requestId: waiting.requestId, controller: new AbortController(), timer: null, deadline: waiting.deadline, answered: false };
    request.timer = setTimeout(cancelActive, remaining);
    active = request;
    try {
      const result = waiting.registration.options.hitTest({ clientX: waiting.x, clientY: waiting.y, signal: request.controller.signal });
      Promise.resolve(result).then((value) => complete(request, value), () => complete(request, void 0));
    } catch {
      complete(request, void 0);
    }
  };
  const onRequest = (event) => {
    if (!(event instanceof CustomEvent) || typeof event.detail !== "string" || event.detail.length > 8192) return;
    let request;
    try {
      request = plain(JSON.parse(event.detail), 6);
    } catch {
      return;
    }
    if (request == null || disposed) return;
    if (request.type === "list") {
      for (const registration2 of surfaces.values()) if (validElement(registration2.options.element)) emit(registration2, "registered");
      return;
    }
    if (request.type === "cancel" || request.type === "clear") {
      cancelActive();
      cancelPending();
      if (request.type === "clear") for (const registration2 of surfaces.values()) render(registration2, { hoveredId: null, selectedId: null });
      return;
    }
    const registration = event.target instanceof HTMLElement ? surfaces.get(event.target) : null;
    if (registration == null || !validElement(registration.options.element)) return;
    if (request.type === "probe") {
      emit(registration, "registered");
      return;
    }
    if (request.registrationId !== registration.id) return;
    if (request.type === "render") {
      if (validNullableId(request.hoveredId) && validNullableId(request.selectedId)) render(registration, { hoveredId: request.hoveredId, selectedId: request.selectedId });
      return;
    }
    if (request.type !== "hit-test" || typeof request.requestId !== "string" || request.requestId.length > 128 || typeof request.x !== "number" || !Number.isFinite(request.x) || typeof request.y !== "number" || !Number.isFinite(request.y)) return;
    cancelPending();
    pending = { registration, requestId: request.requestId, x: request.x, y: request.y, deadline: performance.now() + 250, timer: setTimeout(cancelPending, 250) };
    pump();
  };
  const registerSurface = (options) => {
    if (disposed || options == null || !(options.element instanceof HTMLElement) || !validElement(options.element) || typeof options.hitTest !== "function" || options.renderSelection != null && typeof options.renderSelection !== "function") throw TypeError("Annotation surfaces require a connected top-document element and hitTest callback.");
    const node = options.element, previous = surfaces.get(node);
    if (previous != null) disposeRegistration(previous);
    const registration = { id: documentId + "-" + ++nextId, options: { element: node, hitTest: options.hitTest, renderSelection: options.renderSelection }, renderFailed: false, selection: { hoveredId: null, selectedId: null } };
    surfaces.set(node, registration);
    emit(registration, "registered");
    return { invalidate() {
      if (surfaces.get(node) === registration) {
        if (active?.registration === registration) cancelActive();
        if (pending?.registration === registration) cancelPending();
        emit(registration, "invalidated");
      }
    }, dispose() {
      if (surfaces.get(node) === registration) disposeRegistration(registration);
    } };
  };
  try {
    if (!Reflect.defineProperty(annotation, "registerSurface", { configurable: true, enumerable: false, value: registerSurface })) return false;
  } catch {
    return false;
  }
  const observer = new MutationObserver(() => {
    for (const registration of surfaces.values()) if (!validElement(registration.options.element)) disposeRegistration(registration);
  });
  const remove = () => {
    disposed = true;
    for (const registration of surfaces.values()) disposeRegistration(registration);
    observer.disconnect();
    document.removeEventListener(events.request, onRequest);
    document.removeEventListener(events.remove, remove);
    document.removeEventListener(events.available, pump);
    if (Reflect.getOwnPropertyDescriptor(annotation, "registerSurface")?.value === registerSurface) Reflect.deleteProperty(annotation, "registerSurface");
    if (ownAnnotation && Reflect.ownKeys(annotation).length === 0 && Reflect.getOwnPropertyDescriptor(oai, "annotation")?.value === annotation) Reflect.deleteProperty(oai, "annotation");
    if (ownOai && Reflect.ownKeys(oai).length === 0 && Reflect.getOwnPropertyDescriptor(document, "oai")?.value === oai) Reflect.deleteProperty(document, "oai");
  };
  document.addEventListener(events.request, onRequest);
  document.addEventListener(events.remove, remove);
  document.addEventListener(events.available, pump);
  observer.observe(document, { childList: true, subtree: true });
  return true;
}

// src/computer-use/annotation-site-api.mjs
function installAnnotationSiteAPI(hooks = {}) {
  let nextId = 0, disposed = false;
  const activeGesture = () => navigator.userActivation?.isActive === true;
  const own = (value, key) => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : void 0;
    } catch {
      return void 0;
    }
  };
  const controlsAction = (type, detail) => {
    if (disposed || !["register", "update", "dispose"].includes(type)) return false;
    const accepted = !window.dispatchEvent(new CustomEvent("codex:" + type + "-annotation-controls", { cancelable: true, detail }));
    if (accepted && type !== "dispose") hooks.recordControls?.();
    return accepted;
  };
  const serializeControls = (value) => {
    if (typeof value !== "object" || !value) throw TypeError("Invalid annotation controls");
    const json = JSON.stringify({ controls: value.controls, controlsHeading: value.controlsHeading, controlsMode: value.controlsMode }, (key, item) => {
      if (["function", "symbol", "bigint"].includes(typeof item)) throw TypeError("Annotation controls must contain only data");
      return item;
    });
    if (json.length > 16384) throw RangeError("Annotation controls exceed the maximum size");
    return json;
  };
  const targets = (value) => {
    if (!(value instanceof Element) && (value == null || typeof value[Symbol.iterator] !== "function")) throw TypeError("Annotation controls require element targets");
    const found = /* @__PURE__ */ new Set();
    let count = 0;
    for (const node of value instanceof Element ? [value] : value) {
      if (++count > 128) throw RangeError("Too many annotation control targets");
      if (!(node instanceof Element) || node.ownerDocument !== document) throw TypeError("Annotation control targets must belong to this document");
      found.add(node);
    }
    return [...found];
  };
  const path = (node, ancestor) => {
    const indices = [];
    for (let current = node; current !== ancestor; ) {
      const parent = current.parentNode;
      if (parent == null || indices.length >= 128) return null;
      indices.unshift(Array.from(parent.childNodes).findIndex((child) => child === current));
      current = parent;
    }
    return indices;
  };
  const api = {
    toggle(value) {
      if (disposed || value !== void 0 && typeof value !== "boolean" || !activeGesture() || typeof hooks.toggle !== "function") return { accepted: false };
      const accepted = hooks.toggle(value) === true;
      hooks.recordFeature?.("mode-toggle", accepted);
      return { accepted };
    },
    isActive() {
      return !disposed && typeof hooks.isActive === "function" && hooks.isActive() === true;
    },
    request(target, options = {}) {
      if (typeof options !== "object" || !options || disposed || !activeGesture() || !(target instanceof Element) && !(target instanceof Range)) return { accepted: false };
      const range = target instanceof Range ? target : void 0, ancestor = range ? range.commonAncestorContainer : target, node = ancestor instanceof Element ? ancestor : ancestor.parentElement;
      if (node == null || node.ownerDocument !== document || !node.isConnected || range?.collapsed) return { accepted: false };
      const root = node.getRootNode();
      if (range && root instanceof ShadowRoot && root.mode === "closed") return { accepted: false };
      const startPath = range ? path(range.startContainer, node) : void 0, endPath = range ? path(range.endContainer, node) : void 0, rangeText = range?.toString();
      if (range && (startPath == null || endPath == null || rangeText == null || !rangeText.trim().length || rangeText.length > 2e4)) return { accepted: false };
      const comment = own(options, "initialComment"), initialComment = typeof comment === "string" && comment.length <= 240 ? comment : void 0;
      const mode = own(options, "mode") === "advanced" ? "advanced" : "default", enterAnnotationMode = own(options, "enterAnnotationMode") === true;
      let metadata;
      try {
        const value = own(options, "metadata");
        if (value && typeof value === "object") {
          const prototype = Object.getPrototypeOf(value), properties = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(properties), items = [];
          if ((prototype === Object.prototype || prototype === null) && keys.length <= 6) {
            let valid = true;
            for (const key of keys) {
              const property = properties[key], item = property.value;
              if (typeof key !== "string" || key.length > 64 || !/^[A-Za-z][A-Za-z0-9_-]*(?: [A-Za-z0-9_-]+)*$/.test(key) || ["__proto__", "constructor", "prototype"].includes(key) || !property.enumerable || !Object.hasOwn(property, "value") || item === void 0 || item != null && typeof item !== "string" && typeof item !== "boolean" && (typeof item !== "number" || !Number.isFinite(item)) || typeof item === "string" && (item.length > 256 || !/^[^\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]*$/u.test(item))) {
                valid = false;
                break;
              }
              items.push([key, item]);
            }
            if (valid && items.length) {
              const result = Object.fromEntries(items), json = JSON.stringify(result);
              if (json.length <= 2048 && new TextEncoder().encode(json).byteLength <= 2048) metadata = result;
            }
          }
        }
      } catch {
      }
      if (range || root !== document) metadata = void 0;
      const accepted = !node.dispatchEvent(new CustomEvent("codex:open-annotation", { bubbles: true, cancelable: true, composed: true, detail: { mode, enterAnnotationMode, metadata, initialComment, range: range ? { startPath, endPath, startOffset: range.startOffset, endOffset: range.endOffset, rangeText } : void 0 } }));
      hooks.recordFeature?.(initialComment?.trim() ? "requests-with-prompts" : "requests", accepted);
      if (metadata) hooks.recordFeature?.("metadata", accepted);
      hooks.recordRequest?.(metadata, initialComment, accepted);
      return { accepted };
    },
    registerControls(value) {
      if (typeof value !== "object" || !value) throw TypeError("Invalid annotation controls registration");
      const nodes = targets(value.targets);
      if (!nodes.length) throw TypeError("Annotation controls require element targets");
      const payload = serializeControls(value), id = String(++nextId);
      if (!controlsAction("register", { id, payload, targets: nodes })) throw TypeError("Invalid annotation controls registration");
      let closed = false;
      return Object.freeze({
        update(next) {
          if (closed) throw TypeError("Annotation controls have been disposed");
          const payload2 = serializeControls(next), nodes2 = next.targets;
          if (!controlsAction("update", { id, payload: payload2, targets: nodes2 === void 0 ? void 0 : targets(nodes2) })) throw TypeError("Invalid annotation controls update");
        },
        dispose() {
          if (!closed) {
            closed = true;
            controlsAction("dispose", { id });
          }
        }
      });
    }
  };
  const restore = (object, key, value, descriptor) => {
    if (Reflect.getOwnPropertyDescriptor(object, key)?.value === value) {
      if (descriptor == null) Reflect.deleteProperty(object, key);
      else Reflect.defineProperty(object, key, descriptor);
    }
  };
  try {
    const previousOai = Reflect.get(document, "oai");
    if (previousOai != null && !["object", "function"].includes(typeof previousOai)) return null;
    const oai = previousOai ?? {}, previousAnnotation = Reflect.get(oai, "annotation");
    if (previousAnnotation != null && !["object", "function"].includes(typeof previousAnnotation)) return null;
    const annotation = previousAnnotation ?? {}, oaiDescriptor = Reflect.getOwnPropertyDescriptor(document, "oai"), annotationDescriptor = Reflect.getOwnPropertyDescriptor(oai, "annotation"), owned = [];
    for (const [key, value] of Object.entries(api)) if (!Reflect.has(annotation, key)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(annotation, key);
      if (Reflect.defineProperty(annotation, key, { configurable: true, enumerable: false, value })) owned.push({ key, value, descriptor });
    }
    if (previousAnnotation == null && !Reflect.defineProperty(oai, "annotation", { configurable: true, enumerable: false, value: annotation }) || previousOai == null && !Reflect.defineProperty(document, "oai", { configurable: true, enumerable: false, value: oai })) {
      for (const item of owned) restore(annotation, item.key, item.value, item.descriptor);
      return null;
    }
    return () => {
      disposed = true;
      try {
        for (const item of owned) restore(annotation, item.key, item.value, item.descriptor);
        if (previousAnnotation == null && !Reflect.ownKeys(annotation).length) restore(oai, "annotation", annotation, annotationDescriptor);
        if (previousOai == null && !Reflect.ownKeys(oai).length) restore(document, "oai", oai, oaiDescriptor);
      } catch {
      }
    };
  } catch {
    return null;
  }
}
function installAnnotationSiteControlsReceiver({ token: token2, registrationToken: registrationToken2, role = "projection" } = {}) {
  if (typeof token2 !== "string" || !token2) throw TypeError("Missing private annotation preload identity");
  if (!["projection", "registration"].includes(role) || role === "projection" && (typeof registrationToken2 !== "string" || !registrationToken2 || registrationToken2 === token2)) throw TypeError("Missing annotation registration identity");
  const symbol = Symbol.for("opencu.annotation.site-controls.preload");
  if (Object.hasOwn(globalThis, symbol)) throw TypeError("Annotation controls receiver is already installed");
  const doc = document, win = window, registrations = /* @__PURE__ */ new Map(), remembered = /* @__PURE__ */ new Map(), featureUses = /* @__PURE__ */ new Set(), pendingActions = /* @__PURE__ */ new Map();
  let byNode = /* @__PURE__ */ new WeakMap(), targetCount = 0, order = 0, disposed = false, lastRemembered = null, applied = /* @__PURE__ */ new Map(), nextAction = 0, hostAnnotationState = { canUseSiteAnnotationApi: false, isAgentControllingBrowser: false, interactionMode: "browse", connected: false };
  const own = (value, key) => {
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property && Object.hasOwn(property, "value") ? property.value : void 0;
  };
  const eventDetail = (event) => event instanceof CustomEvent && event.detail && typeof event.detail === "object" ? event.detail : void 0;
  const cleanString = (value) => typeof value === "string" && value.length <= 512 && /^[^\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]*$/u.test(value);
  const label = (value) => {
    if (!cleanString(value)) throw TypeError("Invalid control label");
    const result = value.trim();
    if (!result.length || result.length > 80) throw TypeError("Invalid control label");
    return result;
  };
  const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= -1e4 && value <= 1e4;
  const scalar = (value) => cleanString(value) || number(value) || typeof value === "boolean";
  const optional = (source, result, key, valid) => {
    if (source[key] !== void 0) {
      if (!valid(source[key])) throw TypeError("Invalid control " + key);
      result[key] = source[key];
    }
  };
  const parseControl = (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw TypeError("Invalid annotation control");
    if (typeof value.callback !== "string") throw TypeError("Invalid control callback");
    const callback = value.callback.trim();
    if (!callback.length || callback.length > 80 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(callback)) throw TypeError("Invalid control callback");
    const result = { callback, label: label(value.label), type: value.type };
    optional(value, result, "reference", (item) => typeof item === "string" && item.length > 0 && item.length <= 80 && /^[A-Za-z0-9_./:@$#-]+$/.test(item));
    let valid;
    switch (value.type) {
      case "color":
        valid = (item) => cleanString(item) && /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(item);
        break;
      case "toggle":
        valid = (item) => typeof item === "boolean";
        break;
      case "range":
        if (!number(value.min) || !number(value.max) || typeof value.step !== "number" || !Number.isFinite(value.step) || value.step < 1e-3 || value.step > 1e4 || value.min >= value.max || value.step > value.max - value.min) throw TypeError("Invalid control range");
        Object.assign(result, { min: value.min, max: value.max, step: value.step });
        valid = (item) => number(item) && item >= value.min && item <= value.max;
        break;
      case "select": {
        if (!Array.isArray(value.options) || !value.options.length || value.options.length > 12) throw TypeError("Invalid control options");
        result.options = value.options.map((item) => {
          if (!item || typeof item !== "object" || !cleanString(item.value)) throw TypeError("Invalid control option");
          return { label: label(item.label), value: item.value };
        });
        const values = new Set(result.options.map((item) => item.value));
        if (values.size !== result.options.length) throw TypeError("Duplicate control options");
        valid = (item) => cleanString(item) && values.has(item);
        break;
      }
      default:
        throw TypeError("Invalid annotation control type");
    }
    optional(value, result, "currentValue", valid);
    optional(value, result, "defaultValue", valid);
    return result;
  };
  const parseRegistration = (value, partial = false) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw TypeError("Invalid annotation controls");
    const result = {};
    if (value.controls !== void 0) {
      if (!Array.isArray(value.controls) || value.controls.length > 12) throw TypeError("Invalid annotation controls");
      result.controls = value.controls.map(parseControl);
      if (new Set(result.controls.map((item) => item.callback)).size !== result.controls.length) throw TypeError("Duplicate control callbacks");
    } else if (!partial) throw TypeError("Missing annotation controls");
    if (value.controlsHeading !== void 0) result.controlsHeading = label(value.controlsHeading);
    if (value.controlsMode !== void 0) {
      if (!["extend", "replace"].includes(value.controlsMode)) throw TypeError("Invalid annotation controls mode");
      result.controlsMode = value.controlsMode;
    }
    return result;
  };
  const payload = (json, previous) => {
    if (typeof json !== "string" || json.length > 16384) return void 0;
    try {
      const value = JSON.parse(json);
      return parseRegistration(previous ? { ...previous, ...parseRegistration(value, true) } : value);
    } catch {
      return void 0;
    }
  };
  const inComments = (node) => {
    const root = doc.getElementById("codex-browser-sidebar-comments-root");
    return root != null && (root === node || root.contains(node) || root.shadowRoot?.contains(node) === true);
  };
  const targets = (value) => {
    if (!Array.isArray(value) || !Number.isSafeInteger(value.length) || value.length > 128) return void 0;
    const found = /* @__PURE__ */ new Set();
    for (let index = 0; index < value.length; index++) {
      const node = own(value, String(index));
      if (!(node instanceof Element) || node.ownerDocument !== doc || inComments(node)) return void 0;
      found.add(node);
    }
    return found;
  };
  const add = (registration, nodes) => {
    registration.targets = Array.from(nodes, (node) => new WeakRef(node));
    targetCount += nodes.size;
    for (const node of nodes) {
      let values = byNode.get(node);
      if (!values) byNode.set(node, [registration]);
      else {
        values.push(registration);
        values.sort((a, b) => a.order - b.order);
      }
    }
  };
  const remove = (registration) => {
    targetCount -= registration.targets.length;
    for (const reference of registration.targets) {
      const node = reference.deref(), values = node && byNode.get(node);
      if (!values) continue;
      const index = values.indexOf(registration);
      if (index !== -1) values.splice(index, 1);
      if (!values.length) byNode.delete(node);
    }
  };
  const register = (event) => {
    try {
      if (disposed) return;
      const detail = eventDetail(event);
      if (!detail) return;
      const id = own(detail, "id");
      if (typeof id !== "string" || !id.length || id.length > 80 || registrations.has(id) || registrations.size >= 64) return;
      const controls = payload(own(detail, "payload")), nodes = targets(own(detail, "targets"));
      if (!controls || !nodes?.size || registrations.has(id) || registrations.size >= 64 || targetCount + nodes.size > 1024) return;
      const registration = { id, controls, order: order++, targets: [] };
      registrations.set(id, registration);
      add(registration, nodes);
      featureUses.add("controls");
      event.preventDefault();
    } catch {
    }
  };
  const update = (event) => {
    try {
      if (disposed) return;
      const detail = eventDetail(event);
      if (!detail) return;
      const id = own(detail, "id"), registration = typeof id === "string" && registrations.get(id);
      if (!registration) return;
      const supplied = own(detail, "targets"), nodes = supplied === void 0 ? void 0 : targets(supplied);
      if (supplied !== void 0 && !nodes || registrations.get(id) !== registration) return;
      const controls = payload(own(detail, "payload"), registration.controls);
      if (!controls || nodes && targetCount - registration.targets.length + nodes.size > 1024) return;
      registration.controls = controls;
      if (nodes) {
        remove(registration);
        add(registration, nodes);
      }
      featureUses.add("controls");
      event.preventDefault();
    } catch {
    }
  };
  const unregister = (event) => {
    try {
      if (disposed) return;
      const detail = eventDetail(event);
      if (!detail) return;
      const id = own(detail, "id"), registration = typeof id === "string" && registrations.get(id);
      if (!registration) return;
      registrations.delete(id);
      remove(registration);
      event.preventDefault();
    } catch {
    }
  };
  const featureUse = (event) => {
    if (!disposed && typeof event.detail === "string" && ["mode-toggle", "requests", "requests-with-prompts", "metadata"].includes(event.detail)) featureUses.add(event.detail);
  };
  const fallback = (control) => control.defaultValue ?? control.currentValue ?? (control.type === "color" ? "#ffffff" : control.type === "select" ? control.options[0].value : control.type === "range" ? control.min : false);
  const samePage = (left, right) => {
    let a, b;
    try {
      a = new URL(left);
      b = new URL(right);
    } catch {
      return left === right;
    }
    return ["http:", "https:"].includes(a.protocol) && ["http:", "https:"].includes(b.protocol) ? a.origin === b.origin && a.pathname === b.pathname && a.search === b.search : a.protocol === "file:" && b.protocol === "file:" ? a.pathname === b.pathname && a.search === b.search : left === right;
  };
  const frameDocument = (path) => {
    let current = doc;
    try {
      for (const selector of path) {
        const parts = selector.startsWith("shadow:") ? selector.slice(7).split(">>>") : [selector];
        let root = current, node;
        for (let index = 0; index < parts.length; index++) {
          node = root.querySelector(parts[index]);
          if (!(node instanceof current.defaultView.HTMLElement)) return null;
          if (index < parts.length - 1) {
            if (!node.shadowRoot) return null;
            root = node.shadowRoot;
          }
        }
        if (!(node instanceof current.defaultView.HTMLIFrameElement) || !node.contentWindow) return null;
        current = node.contentWindow.document;
      }
      return current;
    } catch {
      return null;
    }
  };
  const dispatch = (node, value, groupId, results) => {
    if (!node.isConnected && value.action !== "reset") {
      results.push({ groupId, callback: value.callback, action: value.action, dispatched: false, conflict: "target-disconnected" });
      return;
    }
    const actionId = ++nextAction;
    pendingActions.set(actionId, { node, value });
    results.push({ groupId, callback: value.callback, action: value.action, value: value.value, ...value.virtualTarget ? { virtualTarget: { ...value.virtualTarget } } : {}, actionId, dispatched: false, pending: true });
  };
  const clearProjection = () => {
    const results = [], previous = applied;
    applied = /* @__PURE__ */ new Map();
    remembered.clear();
    lastRemembered = null;
    for (const [node, changes] of previous) for (const value of changes.values()) dispatch(node, { ...value, value: value.resetValue, action: "reset" }, value.groupId, results);
    return results;
  };
  const controller = {
    setHostAnnotationState(value) {
      if (role !== "projection" || disposed || !value || !["canUseSiteAnnotationApi", "isAgentControllingBrowser", "connected"].every((key) => typeof value[key] === "boolean") || !["browse", "comment"].includes(value.interactionMode)) return false;
      hostAnnotationState = { canUseSiteAnnotationApi: value.canUseSiteAnnotationApi, isAgentControllingBrowser: value.isAgentControllingBrowser, interactionMode: value.interactionMode, connected: value.connected };
      return true;
    },
    isHostAnnotationActive() {
      return role === "projection" && !disposed && hostAnnotationState.canUseSiteAnnotationApi === true && hostAnnotationState.interactionMode === "comment";
    },
    requestModeToggle(force) {
      if (role !== "projection" || disposed || force !== void 0 && typeof force !== "boolean" || !hostAnnotationState.connected || !hostAnnotationState.canUseSiteAnnotationApi || hostAnnotationState.isAgentControllingBrowser || navigator.userActivation?.isActive !== true || globalThis.isSecureContext !== true || win.top !== win) return false;
      return !win.dispatchEvent(new CustomEvent("opencu:annotation-mode-request", { cancelable: true, detail: JSON.stringify(force === void 0 ? {} : { force }) }));
    },
    recordSiteUse(feature, accepted) {
      if (role !== "projection" || disposed || !["mode-toggle", "requests", "requests-with-prompts", "metadata"].includes(feature) || typeof accepted !== "boolean" || !accepted && hostAnnotationState.canUseSiteAnnotationApi || navigator.userActivation?.isActive !== true || globalThis.isSecureContext !== true || win.top !== win) return false;
      win.dispatchEvent(new CustomEvent("opencu:annotation-feature-use", { detail: feature }));
      return true;
    },
    getFeatureUses() {
      return disposed ? [] : [...featureUses];
    },
    recordUse(feature) {
      if (!disposed && ["mode-toggle", "requests", "requests-with-prompts", "metadata"].includes(feature)) featureUses.add(feature);
    },
    getTargets() {
      const result = /* @__PURE__ */ new Set();
      if (!disposed) for (const registration of registrations.values()) for (const reference of registration.targets) {
        const node = reference.deref();
        if (node instanceof HTMLElement && node.isConnected && node.ownerDocument === doc) result.add(node);
      }
      return [...result];
    },
    getControls(node) {
      return !disposed && node.ownerDocument === doc ? byNode.get(node)?.at(-1)?.controls : void 0;
    },
    getControlsJSON(node) {
      const controls = controller.getControls(node);
      return controls === void 0 ? null : JSON.stringify(controls);
    },
    dispatchControlChange(node, value) {
      if (disposed || !(node instanceof Element) || node.ownerDocument !== doc || !value || !["preview", "preview-original", "reset"].includes(value.action) || typeof value.callback !== "string" || value.callback.length > 80 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value.callback) || !scalar(value.value) || !node.isConnected && value.action !== "reset") return false;
      const virtualTarget = value.virtualTarget;
      if (virtualTarget && ["surfaceId", "targetId"].some((key) => typeof virtualTarget[key] !== "string" || !virtualTarget[key].length || virtualTarget[key].length > 128)) return false;
      node.dispatchEvent(new CustomEvent("oaiannotationcontrolchange", { bubbles: true, detail: { callback: value.callback, value: value.value, action: value.action, ...virtualTarget ? { virtualTarget: { surfaceId: virtualTarget.surfaceId, targetId: virtualTarget.targetId } } : {} } }));
      return true;
    },
    getDispatchTarget(actionId) {
      return pendingActions.get(actionId)?.node ?? null;
    },
    completeDispatch(actionId) {
      return pendingActions.delete(actionId);
    },
    rememberTarget(id, node) {
      if (disposed || typeof id !== "string" || !id || !(node instanceof Element) || node.ownerDocument !== doc || !node.isConnected) return false;
      if (!remembered.has(id)) remembered.set(id, new WeakRef(node));
      lastRemembered = id;
      return true;
    },
    syncProjection(groups, { canUseSiteAnnotationApi, isAgentControllingBrowser = false, enabled = true, showOriginal = false } = {}) {
      if (disposed || canUseSiteAnnotationApi !== true || isAgentControllingBrowser) return { dispatched: clearProjection(), conflicts: [] };
      const desired = /* @__PURE__ */ new Map(), results = [], conflicts = [], ids = new Set(groups.map((group) => group.id));
      for (const id of remembered.keys()) if (id !== lastRemembered && !ids.has(id)) remembered.delete(id);
      for (const group of groups) {
        const node = remembered.get(group.id)?.deref(), anchor = group.anchor;
        if (!node?.isConnected || !anchor || !samePage(anchor.pageUrl, win.location.href) || !Array.isArray(anchor.framePath) || frameDocument(anchor.framePath) !== node.ownerDocument || anchor.frameUrl != null && !samePage(anchor.frameUrl, node.ownerDocument.location.href)) {
          if (group.annotationControlChanges?.length) conflicts.push({ groupId: group.id, conflict: "remembered-target-unavailable" });
          continue;
        }
        const virtualTarget = anchor.kind === "virtual" ? { surfaceId: anchor.surfaceId, targetId: anchor.targetId } : void 0;
        for (const change of group.annotationControlChanges ?? []) {
          const control = group.annotationControls?.controls.find((item) => item.callback === change.callback);
          if (!control) continue;
          const resetCandidate = change.previousValue ?? fallback(control);
          if (!scalar(change.value) || !scalar(resetCandidate) || typeof change.value !== typeof resetCandidate) {
            conflicts.push({ groupId: group.id, callback: change.callback, conflict: "control-value-type-changed" });
            continue;
          }
          if (change.value === resetCandidate) continue;
          const values = desired.get(node) ?? /* @__PURE__ */ new Map(), key = virtualTarget ? JSON.stringify([virtualTarget.surfaceId, virtualTarget.targetId, change.callback]) : change.callback;
          const resetValue = applied.get(node)?.get(key)?.resetValue ?? values.get(key)?.resetValue ?? resetCandidate;
          values.set(key, { groupId: group.id, callback: change.callback, resetValue, value: showOriginal || !enabled ? resetValue : change.value, action: showOriginal || !enabled ? "preview-original" : "preview", virtualTarget });
          desired.set(node, values);
        }
      }
      const previous = applied;
      applied = desired;
      for (const [node, values] of previous) for (const [key, value] of values) if (!desired.get(node)?.has(key)) dispatch(node, { ...value, value: value.resetValue, action: "reset" }, value.groupId, results);
      for (const [node, values] of desired) for (const [key, value] of values) {
        const old = previous.get(node)?.get(key);
        if (old?.value !== value.value || old.action !== value.action) dispatch(node, value, value.groupId, results);
      }
      return { dispatched: results, conflicts };
    },
    clearProjection,
    dispose() {
      if (disposed) return;
      clearProjection();
      disposed = true;
      registrations.clear();
      featureUses.clear();
      pendingActions.clear();
      byNode = /* @__PURE__ */ new WeakMap();
      targetCount = 0;
      win.removeEventListener("codex:register-annotation-controls", register);
      win.removeEventListener("codex:update-annotation-controls", update);
      win.removeEventListener("codex:dispose-annotation-controls", unregister);
      win.removeEventListener("opencu:annotation-feature-use", featureUse);
      win.removeEventListener("pagehide", pagehide);
      if (role === "projection" && globalThis[symbol] === handle) Reflect.deleteProperty(globalThis, symbol);
    }
  };
  const exposed = Object.freeze(role === "registration" ? { getTargets: controller.getTargets, getControls: controller.getControls, getControlsJSON: controller.getControlsJSON, getFeatureUses: controller.getFeatureUses, recordUse: controller.recordUse, dispatchControlChange: controller.dispatchControlChange, dispose: controller.dispose } : { setHostAnnotationState: controller.setHostAnnotationState, isHostAnnotationActive: controller.isHostAnnotationActive, requestModeToggle: controller.requestModeToggle, recordSiteUse: controller.recordSiteUse, rememberTarget: controller.rememberTarget, syncProjection: controller.syncProjection, clearProjection: controller.clearProjection, getDispatchTarget: controller.getDispatchTarget, completeDispatch: controller.completeDispatch, dispose: controller.dispose });
  const pagehide = (event) => {
    if (event.isTrusted && !event.persisted) controller.dispose();
  };
  const handle = Object.freeze({ token: token2, registrationToken: role === "projection" ? registrationToken2 : void 0, controller: exposed, document: doc, role });
  Object.defineProperty(globalThis, symbol, { configurable: role === "projection", enumerable: false, writable: false, value: handle });
  if (role === "registration") {
    win.addEventListener("codex:register-annotation-controls", register);
    win.addEventListener("codex:update-annotation-controls", update);
    win.addEventListener("codex:dispose-annotation-controls", unregister);
    win.addEventListener("opencu:annotation-feature-use", featureUse);
  }
  win.addEventListener("pagehide", pagehide);
  return exposed;
}

// native/plugin-browser/annotation-preload.mjs
var nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) => value.toString(16).padStart(2, "0")).join("");
var token = nonce();
var registrationToken = nonce();
var projection = installAnnotationSiteControlsReceiver({ token, registrationToken, role: "projection" });
import_electron.contextBridge.executeInMainWorld({ func: installAnnotationSiteControlsReceiver, args: [{ token: registrationToken, role: "registration" }] });
import_electron.contextBridge.executeInMainWorld({ func: installAnnotationSurfaceRegistry });
import_electron.contextBridge.executeInMainWorld({ func: installAnnotationSiteAPI, args: [{ toggle: (force) => projection.requestModeToggle(force), isActive: () => projection.isHostAnnotationActive(), recordFeature: (feature, accepted) => projection.recordSiteUse(feature, accepted) }] });
