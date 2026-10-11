import { randomUUID } from 'node:crypto';

export const readonlyEvaluateLimits = Object.freeze({
  timeoutMs: 3000,
  depth: 8,
  arrayLength: 2000,
  objectKeys: 200,
  stringLength: 200000,
});

const bZ = readonlyEvaluateLimits.depth;
const yZ = readonlyEvaluateLimits.arrayLength;
const wZ = readonlyEvaluateLimits.objectKeys;
const vZ = readonlyEvaluateLimits.stringLength;
const In = {
  attributes: ['type', 'autocomplete', 'id', 'name', 'placeholder', 'aria-label', 'title'],
  pattern: /user[-_ ]?name|e[-_ ]?mail|one[-_ ]?time[-_ ]?code|password|passcode|passwd|\botp\b|\b(?:2fa|mfa)\b|phone|mobile|\btel\b/i.source,
};
function ji(t, e) {
  const tag = t.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select') return false;
  if (t.getAttribute('type')?.toLowerCase() === 'hidden') return true;
  let metadata = '';
  for (const name of e.attributes) metadata += ` ${t.getAttribute(name) ?? ''}`;
  return new RegExp(e.pattern, 'i').test(metadata);
}

const TZ = /\bimport\b(?:(?:\s+)|(?:\/\/[^\n\r]*(?:\r?\n|$))|(?:\/\*[\s\S]*?\*\/))*\(/;
function gM(script) {
  if (TZ.test(script)) throw new Error('module loading is not available in playwright.evaluate');
}

// The complete DOM scope factory is recovered from Codex browser-service.mjs.
// The import guard above supplements this isolated-world scope; it is not a sandbox.
export function buildReadonlyDomExpression(t,e,r,n="globalThis"){return gM(t),`(() => {
  const RESULT_MAX_DEPTH = ${bZ};
  const RESULT_MAX_ARRAY_LENGTH = ${yZ};
  const RESULT_MAX_OBJECT_KEYS = ${wZ};
  const RESULT_MAX_STRING_LENGTH = ${vZ};
  const protectedCredentialFieldPolicy = ${JSON.stringify(In)};
  const isProtectedCredentialField = ${ji.toString()};
  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const COMMENT_NODE = 8;
  const DOCUMENT_NODE = 9;
  const DOCUMENT_TYPE_NODE = 10;
  const DOCUMENT_FRAGMENT_NODE = 11;
  const rawWindow = ${n};
  const rawDocument = rawWindow.document;
  const wrapperToken = {};
  const nodeWrappers = new WeakMap();
  const rawNodesByWrapper = new WeakMap();
  const styleWrappers = new WeakSet();
  const mediaListWrappers = new WeakMap();
  const cssRuleWrappers = new WeakMap();
  const styleSheetWrappers = new WeakMap();
  const cssWrappers = new WeakSet();
  const rangeWrappers = new WeakMap();
  const rawRangesByWrapper = new WeakMap();
  const selectionWrappers = new WeakMap();
  const selectionAndRangeWrappers = new WeakSet();
  const fontFaceSetWrappers = new WeakMap();
  const mediaQueryListWrappers = new WeakMap();
  const readonlyApiWrappers = new WeakSet();

  // Define fixed data properties so sandbox bindings cannot be replaced,
  // deleted, or reconfigured by the evaluated script.
  const defineReadonly = (target, name, value) => {
    Object.defineProperty(target, name, {
      configurable: false,
      enumerable: true,
      value,
      writable: false,
    });
  };

  const defineHiddenReadonly = (target, name, value) => {
    Object.defineProperty(target, name, {
      configurable: false,
      enumerable: false,
      value,
      writable: false,
    });
  };

  const defineReadonlyGetter = (target, name, get) => {
    Object.defineProperty(target, name, {
      configurable: false,
      enumerable: true,
      get,
    });
  };

  const readonlyError = (name) =>
    new Error(
      name +
        " is not available in playwright.evaluate because the DOM is read-only",
    );

  const camelToHyphen = (value) =>
    String(value).replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());

  const ownKeys = (value) => Object.keys(value).slice(0, RESULT_MAX_OBJECT_KEYS);

  const makeReadonlyList = (items, configure) => {
    const list = Array.from(items);
    defineHiddenReadonly(list, "constructor", undefined);
    defineHiddenReadonly(list, "item", (index) => list[index] ?? null);
    if (typeof configure === "function") configure(list);
    return Object.freeze(list);
  };

  const makeReadonlyAttribute = (attribute) =>
    Object.freeze({
      name: attribute.name,
      nodeName: attribute.name,
      nodeValue: attribute.value,
      specified: true,
      value: attribute.value,
    });

  const makeReadonlyAttributeList = (element) => {
    const attributes = element.attributes;
    const protectedField = isProtectedCredentialField(
      element,
      protectedCredentialFieldPolicy,
    );
    const list = Array.from(attributes)
      .filter((attribute) => !protectedField || attribute.name.toLowerCase() !== "value")
      .map(makeReadonlyAttribute);
    defineHiddenReadonly(list, "constructor", undefined);
    defineHiddenReadonly(list, "getNamedItem", (name) => {
      const attributeName = String(name);
      if (protectedField && attributeName.toLowerCase() === "value") return null;
      const attribute = attributes.getNamedItem(attributeName);
      return attribute == null ? null : makeReadonlyAttribute(attribute);
    });
    defineHiddenReadonly(list, "item", (index) => list[index] ?? null);
    return Object.freeze(list);
  };

  const makeReadonlyHtml = (node, includeNode) => {
    const html = includeNode ? node.outerHTML : node.innerHTML;
    if (typeof html !== "string") return "";

    const isProtectedInputValue = (element) =>
      element.hasAttribute("value") &&
      isProtectedCredentialField(element, protectedCredentialFieldPolicy);
    if (
      !(includeNode && isProtectedInputValue(node)) &&
      !Array.from(node.querySelectorAll("input[value]")).some(isProtectedInputValue)
    ) return html;

    const template = node.ownerDocument.createElement("template");
    const nodes = includeNode ? [node] : Array.from(node.childNodes);
    for (const child of nodes)
      template.content.append(template.content.ownerDocument.importNode(child, true));
    for (const input of template.content.querySelectorAll("input[value]")) {
      if (isProtectedInputValue(input)) input.removeAttribute("value");
    }
    return template.innerHTML;
  };

  const makeReadonlyTokenList = (tokenList) => {
    if (tokenList == null) return undefined;
    const list = Array.from(tokenList, String);
    defineHiddenReadonly(list, "constructor", undefined);
    defineHiddenReadonly(list, "contains", (value) =>
      tokenList.contains(String(value)),
    );
    defineHiddenReadonly(list, "item", (index) => tokenList.item(index));
    defineHiddenReadonly(list, "value", tokenList.value);
    return Object.freeze(list);
  };

  const makeReadonlyTimeRanges = (ranges) => {
    if (ranges == null) return undefined;
    const list = [];
    for (let index = 0; index < ranges.length; index += 1) {
      list.push(Object.freeze({
        end: ranges.end(index),
        start: ranges.start(index),
      }));
    }
    defineHiddenReadonly(list, "constructor", undefined);
    defineHiddenReadonly(list, "end", (index) => ranges.end(Number(index)));
    defineHiddenReadonly(list, "item", (index) => list[index] ?? null);
    defineHiddenReadonly(list, "start", (index) => ranges.start(Number(index)));
    return Object.freeze(list);
  };

  const makeReadonlyTrackList = (tracks) => {
    if (tracks == null) return undefined;
    const list = Array.from(tracks, (track) =>
      Object.freeze({
        enabled: track.enabled === true,
        id: typeof track.id === "string" ? track.id : "",
        kind: typeof track.kind === "string" ? track.kind : "",
        label: typeof track.label === "string" ? track.label : "",
        language: typeof track.language === "string" ? track.language : "",
        mode: typeof track.mode === "string" ? track.mode : undefined,
        selected: track.selected === true,
      }),
    );
    defineHiddenReadonly(list, "constructor", undefined);
    defineHiddenReadonly(list, "getTrackById", (id) =>
      list.find((track) => track.id === String(id)) ?? null,
    );
    defineHiddenReadonly(list, "item", (index) => list[index] ?? null);
    return Object.freeze(list);
  };

  const makeReadonlyDataset = (dataset) => {
    const output = Object.create(null);
    for (const key of Object.keys(dataset)) {
      defineReadonly(output, key, dataset[key]);
    }
    defineHiddenReadonly(output, "constructor", undefined);
    return Object.freeze(output);
  };

  const makeReadonlyRect = (rect) =>
    Object.freeze({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
      x: rect.x,
      y: rect.y,
      toJSON() {
        return {
          bottom: rect.bottom,
          height: rect.height,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          width: rect.width,
          x: rect.x,
          y: rect.y,
        };
      },
    });

  const makeReadonlyValidityState = (validity) => {
    if (validity == null) return undefined;
    return Object.freeze({
      badInput: validity.badInput === true,
      customError: validity.customError === true,
      patternMismatch: validity.patternMismatch === true,
      rangeOverflow: validity.rangeOverflow === true,
      rangeUnderflow: validity.rangeUnderflow === true,
      stepMismatch: validity.stepMismatch === true,
      tooLong: validity.tooLong === true,
      tooShort: validity.tooShort === true,
      typeMismatch: validity.typeMismatch === true,
      valid: validity.valid === true,
      valueMissing: validity.valueMissing === true,
    });
  };

  const makeNodeSummary = (node) => {
    const wrapper = wrapNode(node);
    return wrapper == null ? null : wrapper.toJSON();
  };

  class ReadonlyStyleDeclaration {
    #style;

    constructor(style, token) {
      if (token !== wrapperToken) throw readonlyError("CSSStyleDeclaration constructor");
      this.#style = style;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get length() {
      return this.#style.length;
    }

    get cssText() {
      return this.#style.cssText ?? "";
    }

    getPropertyValue(name) {
      return this.#style.getPropertyValue(String(name));
    }

    getPropertyPriority(name) {
      return this.#style.getPropertyPriority(String(name));
    }

    item(index) {
      return this.#style.item(Number(index)) ?? "";
    }

    *[Symbol.iterator]() {
      for (let index = 0; index < this.#style.length; index += 1) {
        yield this.item(index);
      }
    }

    toJSON() {
      const output = {};
      const length = Math.min(this.#style.length, RESULT_MAX_OBJECT_KEYS);
      for (let index = 0; index < length; index += 1) {
        const name = this.#style.item(index);
        output[name] = this.#style.getPropertyValue(name);
      }
      return output;
    }
  }

  const wrapStyle = (style) => {
    const wrapper = new Proxy(new ReadonlyStyleDeclaration(style, wrapperToken), {
      get(target, property, receiver) {
        if (property === Symbol.toStringTag) return "CSSStyleDeclaration";
        if (property === Symbol.iterator)
          return target[Symbol.iterator].bind(target);
        if (typeof property === "string") {
          if (/^\\d+$/.test(property)) return target.item(Number(property));
          if (property in target) {
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          }
          if (typeof style[property] === "function") return undefined;
          return (
            target.getPropertyValue(camelToHyphen(property)) ||
            target.getPropertyValue(property)
          );
        }
        return Reflect.get(target, property, receiver);
      },
      set() {
        throw readonlyError("CSSStyleDeclaration assignment");
      },
    });
    styleWrappers.add(wrapper);
    return wrapper;
  };

  // CSSOM wrappers expose stylesheet and rule reads without exposing mutation
  // methods like insertRule(), deleteRule(), replace(), or setProperty().
  // Inaccessible cssRules keep native browser behavior when read directly; the
  // serializer records that state without trying a network fallback.
  class ReadonlyMediaList {
    #media;

    constructor(media, token) {
      if (token !== wrapperToken) throw readonlyError("MediaList constructor");
      this.#media = media;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get length() {
      return this.#media.length;
    }

    get mediaText() {
      return this.#media.mediaText;
    }

    item(index) {
      return this.#media.item(Number(index)) ?? "";
    }

    *[Symbol.iterator]() {
      for (let index = 0; index < this.#media.length; index += 1) {
        yield this.item(index);
      }
    }

    toJSON() {
      return Array.from(this);
    }
  }

  const wrapMediaList = (media) => {
    if (media == null) return null;
    const existing = mediaListWrappers.get(media);
    if (existing != null) return existing;
    const wrapper = new ReadonlyMediaList(media, wrapperToken);
    mediaListWrappers.set(media, wrapper);
    cssWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlyCSSRule {
    #rule;

    constructor(rule, token) {
      if (token !== wrapperToken) throw readonlyError("CSSRule constructor");
      this.#rule = rule;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get conditionText() {
      return typeof this.#rule.conditionText === "string"
        ? this.#rule.conditionText
        : undefined;
    }

    get cssRules() {
      if (!("cssRules" in this.#rule)) return undefined;
      return makeReadonlyList(Array.from(this.#rule.cssRules, wrapCSSRule));
    }

    get cssText() {
      return this.#rule.cssText;
    }

    get href() {
      return typeof this.#rule.href === "string" ? this.#rule.href : undefined;
    }

    get keyText() {
      return typeof this.#rule.keyText === "string" ? this.#rule.keyText : undefined;
    }

    get media() {
      return "media" in this.#rule ? wrapMediaList(this.#rule.media) : undefined;
    }

    get name() {
      return typeof this.#rule.name === "string" ? this.#rule.name : undefined;
    }

    get parentRule() {
      return wrapCSSRule(this.#rule.parentRule);
    }

    get parentStyleSheet() {
      return wrapCSSStyleSheet(this.#rule.parentStyleSheet);
    }

    get selectorText() {
      return typeof this.#rule.selectorText === "string"
        ? this.#rule.selectorText
        : undefined;
    }

    get style() {
      return this.#rule.style == null ? undefined : wrapStyle(this.#rule.style);
    }

    get styleSheet() {
      return wrapCSSStyleSheet(this.#rule.styleSheet);
    }

    get type() {
      return this.#rule.type;
    }

    toJSON() {
      const output = {
        cssText: this.cssText,
        type: this.type,
      };
      for (const name of [
        "conditionText",
        "href",
        "keyText",
        "name",
        "selectorText",
      ]) {
        const value = this[name];
        if (value !== undefined) output[name] = value;
      }
      if (this.style !== undefined) output.style = this.style.toJSON();
      return output;
    }
  }

  const wrapCSSRule = (rule) => {
    if (rule == null) return null;
    const existing = cssRuleWrappers.get(rule);
    if (existing != null) return existing;
    const wrapper = new ReadonlyCSSRule(rule, wrapperToken);
    cssRuleWrappers.set(rule, wrapper);
    cssWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlyCSSStyleSheet {
    #sheet;

    constructor(sheet, token) {
      if (token !== wrapperToken) throw readonlyError("CSSStyleSheet constructor");
      this.#sheet = sheet;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get cssRules() {
      return makeReadonlyList(Array.from(this.#sheet.cssRules, wrapCSSRule));
    }

    get disabled() {
      return this.#sheet.disabled === true;
    }

    get href() {
      return this.#sheet.href;
    }

    get media() {
      return wrapMediaList(this.#sheet.media);
    }

    get ownerNode() {
      return wrapNode(this.#sheet.ownerNode);
    }

    get ownerRule() {
      return wrapCSSRule(this.#sheet.ownerRule);
    }

    get parentStyleSheet() {
      return wrapCSSStyleSheet(this.#sheet.parentStyleSheet);
    }

    get rules() {
      return this.cssRules;
    }

    get title() {
      return this.#sheet.title;
    }

    get type() {
      return this.#sheet.type;
    }

    toJSON() {
      const output = {
        disabled: this.disabled,
        href: this.href,
        media: this.media?.toJSON() ?? null,
        title: this.title,
        type: this.type,
      };
      try {
        output.ruleCount = this.cssRules.length;
      } catch (error) {
        output.ruleAccessError =
          error instanceof Error ? error.name || error.message : String(error);
      }
      return output;
    }
  }

  const wrapCSSStyleSheet = (sheet) => {
    if (sheet == null) return null;
    const existing = styleSheetWrappers.get(sheet);
    if (existing != null) return existing;
    const wrapper = new ReadonlyCSSStyleSheet(sheet, wrapperToken);
    styleSheetWrappers.set(sheet, wrapper);
    cssWrappers.add(wrapper);
    return wrapper;
  };

  const unwrapRange = (value) =>
    value != null && (typeof value === "object" || typeof value === "function")
      ? rawRangesByWrapper.get(value) ?? null
      : null;

  class ReadonlyRange {
    #range;

    constructor(range, token) {
      if (token !== wrapperToken) throw readonlyError("Range constructor");
      this.#range = range;
      rawRangesByWrapper.set(this, range);
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get collapsed() {
      return this.#range.collapsed === true;
    }

    get commonAncestorContainer() {
      return wrapNode(this.#range.commonAncestorContainer);
    }

    get endContainer() {
      return wrapNode(this.#range.endContainer);
    }

    get endOffset() {
      return this.#range.endOffset;
    }

    get startContainer() {
      return wrapNode(this.#range.startContainer);
    }

    get startOffset() {
      return this.#range.startOffset;
    }

    compareBoundaryPoints(how, sourceRange) {
      const rawRange = unwrapRange(sourceRange);
      if (rawRange == null) throw new TypeError("compareBoundaryPoints expects a Range");
      return this.#range.compareBoundaryPoints(Number(how), rawRange);
    }

    comparePoint(node, offset) {
      const rawNode = unwrapNode(node);
      if (rawNode == null) throw new TypeError("comparePoint expects a Node");
      return this.#range.comparePoint(rawNode, Number(offset));
    }

    getBoundingClientRect() {
      return makeReadonlyRect(this.#range.getBoundingClientRect());
    }

    getClientRects() {
      return makeReadonlyList(
        Array.from(this.#range.getClientRects(), makeReadonlyRect),
      );
    }

    intersectsNode(node) {
      const rawNode = unwrapNode(node);
      return rawNode != null && this.#range.intersectsNode(rawNode);
    }

    isPointInRange(node, offset) {
      const rawNode = unwrapNode(node);
      return rawNode != null && this.#range.isPointInRange(rawNode, Number(offset));
    }

    selectNodeContents(node) {
      const rawNode = unwrapNode(node);
      if (rawNode == null) throw new TypeError("selectNodeContents expects a Node");
      this.#range.selectNodeContents(rawNode);
    }

    setEnd(node, offset) {
      const rawNode = unwrapNode(node);
      if (rawNode == null) throw new TypeError("setEnd expects a Node");
      this.#range.setEnd(rawNode, Number(offset));
    }

    setStart(node, offset) {
      const rawNode = unwrapNode(node);
      if (rawNode == null) throw new TypeError("setStart expects a Node");
      this.#range.setStart(rawNode, Number(offset));
    }

    toJSON() {
      return {
        collapsed: this.collapsed,
        commonAncestorContainer: makeNodeSummary(this.#range.commonAncestorContainer),
        endOffset: this.endOffset,
        startOffset: this.startOffset,
        text: this.toString(),
      };
    }

    toString() {
      return this.#range.toString();
    }
  }

  const wrapRange = (range) => {
    if (range == null) return null;
    const existing = rangeWrappers.get(range);
    if (existing != null) return existing;
    const wrapper = new ReadonlyRange(range, wrapperToken);
    rangeWrappers.set(range, wrapper);
    selectionAndRangeWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlySelection {
    #selection;

    constructor(selection, token) {
      if (token !== wrapperToken) throw readonlyError("Selection constructor");
      this.#selection = selection;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get anchorNode() {
      return wrapNode(this.#selection.anchorNode);
    }

    get anchorOffset() {
      return this.#selection.anchorOffset;
    }

    get focusNode() {
      return wrapNode(this.#selection.focusNode);
    }

    get focusOffset() {
      return this.#selection.focusOffset;
    }

    get isCollapsed() {
      return this.#selection.isCollapsed === true;
    }

    get rangeCount() {
      return this.#selection.rangeCount;
    }

    get type() {
      return this.#selection.type;
    }

    containsNode(node, allowPartialContainment = false) {
      const rawNode = unwrapNode(node);
      return (
        rawNode != null &&
        this.#selection.containsNode(rawNode, Boolean(allowPartialContainment))
      );
    }

    getRangeAt(index) {
      return wrapRange(this.#selection.getRangeAt(Number(index)).cloneRange());
    }

    toJSON() {
      return {
        anchorNode: makeNodeSummary(this.#selection.anchorNode),
        anchorOffset: this.anchorOffset,
        focusNode: makeNodeSummary(this.#selection.focusNode),
        focusOffset: this.focusOffset,
        isCollapsed: this.isCollapsed,
        rangeCount: this.rangeCount,
        text: this.toString(),
        type: this.type,
      };
    }

    toString() {
      return this.#selection.toString();
    }
  }

  const wrapSelection = (selection) => {
    if (selection == null) return null;
    const existing = selectionWrappers.get(selection);
    if (existing != null) return existing;
    const wrapper = new ReadonlySelection(selection, wrapperToken);
    selectionWrappers.set(selection, wrapper);
    selectionAndRangeWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlyFontFaceSet {
    #fonts;

    constructor(fonts, token) {
      if (token !== wrapperToken) throw readonlyError("FontFaceSet constructor");
      this.#fonts = fonts;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get size() {
      return this.#fonts.size;
    }

    get status() {
      return this.#fonts.status;
    }

    check(font, text) {
      return this.#fonts.check(
        String(font),
        text === undefined ? undefined : String(text),
      );
    }

    toJSON() {
      return {
        size: this.size,
        status: this.status,
      };
    }
  }

  const wrapFontFaceSet = (fonts) => {
    if (fonts == null) return undefined;
    const existing = fontFaceSetWrappers.get(fonts);
    if (existing != null) return existing;
    const wrapper = new ReadonlyFontFaceSet(fonts, wrapperToken);
    fontFaceSetWrappers.set(fonts, wrapper);
    readonlyApiWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlyMediaQueryList {
    #query;

    constructor(query, token) {
      if (token !== wrapperToken) throw readonlyError("MediaQueryList constructor");
      this.#query = query;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get matches() {
      return this.#query.matches === true;
    }

    get media() {
      return this.#query.media;
    }

    toJSON() {
      return {
        matches: this.matches,
        media: this.media,
      };
    }
  }

  const wrapMediaQueryList = (query) => {
    if (query == null) return null;
    const existing = mediaQueryListWrappers.get(query);
    if (existing != null) return existing;
    const wrapper = new ReadonlyMediaQueryList(query, wrapperToken);
    mediaQueryListWrappers.set(query, wrapper);
    readonlyApiWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlyVisualViewport {
    #viewport;

    constructor(viewport, token) {
      if (token !== wrapperToken) throw readonlyError("VisualViewport constructor");
      this.#viewport = viewport;
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get height() {
      return this.#viewport.height;
    }

    get offsetLeft() {
      return this.#viewport.offsetLeft;
    }

    get offsetTop() {
      return this.#viewport.offsetTop;
    }

    get pageLeft() {
      return this.#viewport.pageLeft;
    }

    get pageTop() {
      return this.#viewport.pageTop;
    }

    get scale() {
      return this.#viewport.scale;
    }

    get width() {
      return this.#viewport.width;
    }

    toJSON() {
      return {
        height: this.height,
        offsetLeft: this.offsetLeft,
        offsetTop: this.offsetTop,
        pageLeft: this.pageLeft,
        pageTop: this.pageTop,
        scale: this.scale,
        width: this.width,
      };
    }
  }

  const wrapVisualViewport = (viewport) => {
    if (viewport == null) return null;
    const wrapper = new ReadonlyVisualViewport(viewport, wrapperToken);
    readonlyApiWrappers.add(wrapper);
    return wrapper;
  };

  class ReadonlyLocation {
    constructor() {
      defineHiddenReadonly(this, "constructor", undefined);
      Object.freeze(this);
    }

    get hash() {
      return rawWindow.location.hash;
    }

    get host() {
      return rawWindow.location.host;
    }

    get hostname() {
      return rawWindow.location.hostname;
    }

    get href() {
      return rawWindow.location.href;
    }

    get origin() {
      return rawWindow.location.origin;
    }

    get pathname() {
      return rawWindow.location.pathname;
    }

    get port() {
      return rawWindow.location.port;
    }

    get protocol() {
      return rawWindow.location.protocol;
    }

    get search() {
      return rawWindow.location.search;
    }

    toJSON() {
      return this.href;
    }

    toString() {
      return this.href;
    }
  }

  class ReadonlyNode {
    #node;

    constructor(node, token) {
      if (token !== wrapperToken) throw readonlyError("Node constructor");
      this.#node = node;
      rawNodesByWrapper.set(this, node);
      defineHiddenReadonly(this, "constructor", undefined);
      if (new.target === ReadonlyNode) Object.freeze(this);
    }

    get childNodes() {
      return makeReadonlyNodeList(this.#node.childNodes);
    }

    get firstChild() {
      return wrapNode(this.#node.firstChild);
    }

    get lastChild() {
      return wrapNode(this.#node.lastChild);
    }

    get nextSibling() {
      return wrapNode(this.#node.nextSibling);
    }

    get nodeName() {
      return this.#node.nodeName;
    }

    get name() {
      return typeof this.#node.name === "string" ? this.#node.name : undefined;
    }

    get nodeType() {
      return this.#node.nodeType;
    }

    get nodeValue() {
      return this.#node.nodeValue;
    }

    get publicId() {
      return typeof this.#node.publicId === "string" ? this.#node.publicId : undefined;
    }

    get systemId() {
      return typeof this.#node.systemId === "string" ? this.#node.systemId : undefined;
    }

    get isConnected() {
      return this.#node.isConnected === true;
    }

    get ownerDocument() {
      return wrapNode(this.#node.ownerDocument ?? rawDocument);
    }

    get parentElement() {
      return wrapNode(this.#node.parentElement);
    }

    get parentNode() {
      return wrapNode(this.#node.parentNode);
    }

    get previousSibling() {
      return wrapNode(this.#node.previousSibling);
    }

    get textContent() {
      return this.#node.textContent;
    }

    contains(node) {
      const rawNode = unwrapNode(node);
      return rawNode != null && this.#node.contains(rawNode);
    }

    getRootNode(options) {
      return wrapNode(
        typeof this.#node.getRootNode === "function"
          ? this.#node.getRootNode(options)
          : (this.#node.ownerDocument ?? rawDocument),
      );
    }

    toJSON() {
      return {
        name: this.name,
        nodeName: this.nodeName,
        nodeType: this.nodeType,
        publicId: this.publicId,
        systemId: this.systemId,
        textContent: this.textContent,
      };
    }
  }

  class ReadonlyElement extends ReadonlyNode {
    #element;

    constructor(element, token) {
      super(element, token);
      this.#element = element;
      Object.freeze(this);
    }

    get attributes() {
      return makeReadonlyAttributeList(this.#element);
    }

    get alt() {
      return typeof this.#element.alt === "string" ? this.#element.alt : "";
    }

    get ariaChecked() {
      return typeof this.#element.ariaChecked === "string"
        ? this.#element.ariaChecked
        : null;
    }

    get ariaControls() {
      return typeof this.#element.ariaControls === "string"
        ? this.#element.ariaControls
        : null;
    }

    get ariaCurrent() {
      return typeof this.#element.ariaCurrent === "string"
        ? this.#element.ariaCurrent
        : null;
    }

    get ariaDescribedBy() {
      return typeof this.#element.ariaDescribedBy === "string"
        ? this.#element.ariaDescribedBy
        : null;
    }

    get ariaDescription() {
      return typeof this.#element.ariaDescription === "string"
        ? this.#element.ariaDescription
        : null;
    }

    get ariaDisabled() {
      return typeof this.#element.ariaDisabled === "string"
        ? this.#element.ariaDisabled
        : null;
    }

    get ariaExpanded() {
      return typeof this.#element.ariaExpanded === "string"
        ? this.#element.ariaExpanded
        : null;
    }

    get ariaHasPopup() {
      return typeof this.#element.ariaHasPopup === "string"
        ? this.#element.ariaHasPopup
        : null;
    }

    get ariaHidden() {
      return typeof this.#element.ariaHidden === "string"
        ? this.#element.ariaHidden
        : null;
    }

    get ariaInvalid() {
      return typeof this.#element.ariaInvalid === "string"
        ? this.#element.ariaInvalid
        : null;
    }

    get action() {
      return typeof this.#element.action === "string" ? this.#element.action : "";
    }

    get allow() {
      return typeof this.#element.allow === "string" ? this.#element.allow : "";
    }

    get ariaLabel() {
      return typeof this.#element.ariaLabel === "string"
        ? this.#element.ariaLabel
        : null;
    }

    get ariaLabelledBy() {
      return typeof this.#element.ariaLabelledBy === "string"
        ? this.#element.ariaLabelledBy
        : null;
    }

    get ariaPressed() {
      return typeof this.#element.ariaPressed === "string"
        ? this.#element.ariaPressed
        : null;
    }

    get ariaSelected() {
      return typeof this.#element.ariaSelected === "string"
        ? this.#element.ariaSelected
        : null;
    }

    get ariaSort() {
      return typeof this.#element.ariaSort === "string"
        ? this.#element.ariaSort
        : null;
    }

    get ariaValueMax() {
      return typeof this.#element.ariaValueMax === "string"
        ? this.#element.ariaValueMax
        : null;
    }

    get ariaValueMin() {
      return typeof this.#element.ariaValueMin === "string"
        ? this.#element.ariaValueMin
        : null;
    }

    get ariaValueNow() {
      return typeof this.#element.ariaValueNow === "string"
        ? this.#element.ariaValueNow
        : null;
    }

    get ariaValueText() {
      return typeof this.#element.ariaValueText === "string"
        ? this.#element.ariaValueText
        : null;
    }

    get as() {
      return typeof this.#element.as === "string" ? this.#element.as : "";
    }

    get assignedElements() {
      if (typeof this.#element.assignedElements !== "function") return undefined;
      return (options = {}) =>
        makeReadonlyList(
          Array.from(
            this.#element.assignedElements({ flatten: options.flatten === true }),
            wrapNode,
          ),
        );
    }

    get assignedNodes() {
      if (typeof this.#element.assignedNodes !== "function") return undefined;
      return (options = {}) =>
        makeReadonlyList(
          Array.from(
            this.#element.assignedNodes({ flatten: options.flatten === true }),
            wrapNode,
          ),
        );
    }

    get assignedSlot() {
      return wrapNode(this.#element.assignedSlot);
    }

    get async() {
      return this.#element.async === true;
    }

    get autoplay() {
      return this.#element.autoplay === true;
    }

    get autocomplete() {
      return typeof this.#element.autocomplete === "string"
        ? this.#element.autocomplete
        : "";
    }

    get buffered() {
      return makeReadonlyTimeRanges(this.#element.buffered);
    }

    get checked() {
      return this.#element.checked === true;
    }

    get children() {
      return makeReadonlyNodeList(this.#element.children);
    }

    get caption() {
      return wrapNode(this.#element.caption);
    }

    get cellIndex() {
      return this.#element.cellIndex ?? -1;
    }

    get cells() {
      return makeReadonlyNodeList(this.#element.cells);
    }

    get clientHeight() {
      return this.#element.clientHeight ?? 0;
    }

    get clientLeft() {
      return this.#element.clientLeft ?? 0;
    }

    get clientTop() {
      return this.#element.clientTop ?? 0;
    }

    get clientWidth() {
      return this.#element.clientWidth ?? 0;
    }

    get classList() {
      return makeReadonlyTokenList(this.#element.classList);
    }

    get className() {
      const className = this.#element.className;
      if (typeof className === "string") return className;
      if (typeof className?.baseVal === "string") return className.baseVal;
      return "";
    }

    get colSpan() {
      return this.#element.colSpan ?? 1;
    }

    get content() {
      const content = this.#element.content;
      if (content === undefined) return undefined;
      return content != null && typeof content === "object" && "nodeType" in content
        ? wrapNode(content)
        : content;
    }

    get controls() {
      return this.#element.controls === true;
    }

    get crossOrigin() {
      return typeof this.#element.crossOrigin === "string"
        ? this.#element.crossOrigin
        : null;
    }

    get currentTime() {
      return this.#element.currentTime ?? 0;
    }

    get dataset() {
      return makeReadonlyDataset(this.#element.dataset);
    }

    get decoding() {
      return typeof this.#element.decoding === "string"
        ? this.#element.decoding
        : "";
    }

    get defaultSelected() {
      return this.#element.defaultSelected === true;
    }

    get defaultValue() {
      if (isProtectedCredentialField(this.#element, protectedCredentialFieldPolicy))
        return "";
      return typeof this.#element.defaultValue === "string"
        ? this.#element.defaultValue
        : "";
    }

    get defer() {
      return this.#element.defer === true;
    }

    get defaultMuted() {
      return this.#element.defaultMuted === true;
    }

    get defaultPlaybackRate() {
      return this.#element.defaultPlaybackRate ?? 1;
    }

    get disabled() {
      return this.#element.disabled === true;
    }

    get dir() {
      return typeof this.#element.dir === "string" ? this.#element.dir : "";
    }

    get download() {
      return typeof this.#element.download === "string"
        ? this.#element.download
        : "";
    }

    get complete() {
      return this.#element.complete === true;
    }

    get currentSrc() {
      return typeof this.#element.currentSrc === "string" ? this.#element.currentSrc : "";
    }

    get duration() {
      return this.#element.duration ?? 0;
    }

    get elements() {
      return makeReadonlyNodeList(this.#element.elements);
    }

    get ended() {
      return this.#element.ended === true;
    }

    get enctype() {
      return typeof this.#element.enctype === "string"
        ? this.#element.enctype
        : "";
    }

    get exportparts() {
      return typeof this.#element.exportparts === "string"
        ? this.#element.exportparts
        : "";
    }

    get firstElementChild() {
      return wrapNode(this.#element.firstElementChild);
    }

    get form() {
      return wrapNode(this.#element.form);
    }

    get formAction() {
      return typeof this.#element.formAction === "string"
        ? this.#element.formAction
        : "";
    }

    get formEnctype() {
      return typeof this.#element.formEnctype === "string"
        ? this.#element.formEnctype
        : "";
    }

    get formMethod() {
      return typeof this.#element.formMethod === "string"
        ? this.#element.formMethod
        : "";
    }

    get formNoValidate() {
      return this.#element.formNoValidate === true;
    }

    get formTarget() {
      return typeof this.#element.formTarget === "string"
        ? this.#element.formTarget
        : "";
    }

    get height() {
      return this.#element.height ?? 0;
    }

    get hash() {
      return typeof this.#element.hash === "string" ? this.#element.hash : "";
    }

    get hidden() {
      return this.#element.hidden === true;
    }

    get fetchPriority() {
      return typeof this.#element.fetchPriority === "string"
        ? this.#element.fetchPriority
        : "";
    }

    get host() {
      return typeof this.#element.host === "string" ? this.#element.host : "";
    }

    get hostname() {
      return typeof this.#element.hostname === "string"
        ? this.#element.hostname
        : "";
    }

    get href() {
      return typeof this.#element.href === "string" ? this.#element.href : "";
    }

    get hreflang() {
      return typeof this.#element.hreflang === "string"
        ? this.#element.hreflang
        : "";
    }

    get httpEquiv() {
      return typeof this.#element.httpEquiv === "string"
        ? this.#element.httpEquiv
        : "";
    }

    get htmlFor() {
      return typeof this.#element.htmlFor === "string" ? this.#element.htmlFor : "";
    }

    get id() {
      return this.#element.id;
    }

    get index() {
      return this.#element.index ?? -1;
    }

    get innerHTML() {
      return makeReadonlyHtml(this.#element, false);
    }

    get innerText() {
      return this.#element.innerText;
    }

    get lastElementChild() {
      return wrapNode(this.#element.lastElementChild);
    }

    get labels() {
      return makeReadonlyNodeList(this.#element.labels);
    }

    get label() {
      return typeof this.#element.label === "string" ? this.#element.label : "";
    }

    get lang() {
      return typeof this.#element.lang === "string" ? this.#element.lang : "";
    }

    get length() {
      return this.#element.length ?? 0;
    }

    get loading() {
      return typeof this.#element.loading === "string"
        ? this.#element.loading
        : "";
    }

    get loop() {
      return this.#element.loop === true;
    }

    get list() {
      return wrapNode(this.#element.list);
    }

    get localName() {
      return this.#element.localName;
    }

    get maxLength() {
      return this.#element.maxLength ?? -1;
    }

    get minLength() {
      return this.#element.minLength ?? -1;
    }

    get media() {
      return typeof this.#element.media === "string" ? this.#element.media : "";
    }

    get max() {
      return typeof this.#element.max === "string" ? this.#element.max : "";
    }

    get method() {
      return typeof this.#element.method === "string" ? this.#element.method : "";
    }

    get min() {
      return typeof this.#element.min === "string" ? this.#element.min : "";
    }

    get multiple() {
      return this.#element.multiple === true;
    }

    get muted() {
      return this.#element.muted === true;
    }

    get name() {
      return typeof this.#element.name === "string" ? this.#element.name : "";
    }

    get namespaceURI() {
      return this.#element.namespaceURI;
    }

    get noValidate() {
      return this.#element.noValidate === true;
    }

    get naturalHeight() {
      return this.#element.naturalHeight ?? 0;
    }

    get naturalWidth() {
      return this.#element.naturalWidth ?? 0;
    }

    get nextElementSibling() {
      return wrapNode(this.#element.nextElementSibling);
    }

    get outerHTML() {
      return makeReadonlyHtml(this.#element, true);
    }

    get offsetHeight() {
      return this.#element.offsetHeight ?? 0;
    }

    get offsetLeft() {
      return this.#element.offsetLeft ?? 0;
    }

    get offsetTop() {
      return this.#element.offsetTop ?? 0;
    }

    get offsetWidth() {
      return this.#element.offsetWidth ?? 0;
    }

    get options() {
      return makeReadonlyNodeList(this.#element.options);
    }

    get open() {
      return this.#element.open === true;
    }

    get origin() {
      return typeof this.#element.origin === "string" ? this.#element.origin : "";
    }

    get paused() {
      return this.#element.paused === true;
    }

    get part() {
      return makeReadonlyTokenList(this.#element.part);
    }

    get pathname() {
      return typeof this.#element.pathname === "string"
        ? this.#element.pathname
        : "";
    }

    get pattern() {
      return typeof this.#element.pattern === "string"
        ? this.#element.pattern
        : "";
    }

    get playbackRate() {
      return this.#element.playbackRate ?? 1;
    }

    get ping() {
      return typeof this.#element.ping === "string" ? this.#element.ping : "";
    }

    get played() {
      return makeReadonlyTimeRanges(this.#element.played);
    }

    get placeholder() {
      return typeof this.#element.placeholder === "string"
        ? this.#element.placeholder
        : "";
    }

    get port() {
      return typeof this.#element.port === "string" ? this.#element.port : "";
    }

    get poster() {
      return typeof this.#element.poster === "string" ? this.#element.poster : "";
    }

    get protocol() {
      return typeof this.#element.protocol === "string"
        ? this.#element.protocol
        : "";
    }

    get previousElementSibling() {
      return wrapNode(this.#element.previousElementSibling);
    }

    get readOnly() {
      return this.#element.readOnly === true;
    }

    get readyState() {
      return this.#element.readyState ?? 0;
    }

    get referrerPolicy() {
      return typeof this.#element.referrerPolicy === "string"
        ? this.#element.referrerPolicy
        : "";
    }

    get rel() {
      return typeof this.#element.rel === "string" ? this.#element.rel : "";
    }

    get relList() {
      return makeReadonlyTokenList(this.#element.relList);
    }

    get required() {
      return this.#element.required === true;
    }

    get role() {
      return typeof this.#element.role === "string" ? this.#element.role : null;
    }

    get sandbox() {
      return makeReadonlyTokenList(this.#element.sandbox);
    }

    get scrollHeight() {
      return this.#element.scrollHeight ?? 0;
    }

    get scrollLeft() {
      return this.#element.scrollLeft ?? 0;
    }

    get scrollTop() {
      return this.#element.scrollTop ?? 0;
    }

    get scrollWidth() {
      return this.#element.scrollWidth ?? 0;
    }

    get rowIndex() {
      return this.#element.rowIndex ?? -1;
    }

    get rows() {
      return makeReadonlyNodeList(this.#element.rows);
    }

    get rowSpan() {
      return this.#element.rowSpan ?? 1;
    }

    get sectionRowIndex() {
      return this.#element.sectionRowIndex ?? -1;
    }

    get selected() {
      return this.#element.selected === true;
    }

    get selectedOptions() {
      return makeReadonlyNodeList(this.#element.selectedOptions);
    }

    get selectedIndex() {
      return this.#element.selectedIndex ?? -1;
    }

    get selectionDirection() {
      return typeof this.#element.selectionDirection === "string"
        ? this.#element.selectionDirection
        : null;
    }

    get selectionEnd() {
      return this.#element.selectionEnd ?? null;
    }

    get selectionStart() {
      return this.#element.selectionStart ?? null;
    }

    get shadowRoot() {
      return wrapNode(this.#element.shadowRoot);
    }

    get search() {
      return typeof this.#element.search === "string" ? this.#element.search : "";
    }

    get seekable() {
      return makeReadonlyTimeRanges(this.#element.seekable);
    }

    get size() {
      return this.#element.size ?? 0;
    }

    get sizes() {
      return typeof this.#element.sizes === "string" ? this.#element.sizes : "";
    }

    get slot() {
      return typeof this.#element.slot === "string" ? this.#element.slot : "";
    }

    get src() {
      return typeof this.#element.src === "string" ? this.#element.src : "";
    }

    get srcdoc() {
      return typeof this.#element.srcdoc === "string" ? this.#element.srcdoc : "";
    }

    get srcset() {
      return typeof this.#element.srcset === "string" ? this.#element.srcset : "";
    }

    get step() {
      return typeof this.#element.step === "string" ? this.#element.step : "";
    }

    get style() {
      return wrapStyle(this.#element.style);
    }

    get tagName() {
      return this.#element.tagName;
    }

    get tabIndex() {
      return this.#element.tabIndex ?? -1;
    }

    get tBodies() {
      return makeReadonlyNodeList(this.#element.tBodies);
    }

    get tFoot() {
      return wrapNode(this.#element.tFoot);
    }

    get tHead() {
      return wrapNode(this.#element.tHead);
    }

    get target() {
      return typeof this.#element.target === "string" ? this.#element.target : "";
    }

    get text() {
      return typeof this.#element.text === "string"
        ? this.#element.text
        : this.textContent;
    }

    get textTracks() {
      return makeReadonlyTrackList(this.#element.textTracks);
    }

    get title() {
      return typeof this.#element.title === "string" ? this.#element.title : "";
    }

    get type() {
      return typeof this.#element.type === "string" ? this.#element.type : "";
    }

    get validationMessage() {
      if (isProtectedCredentialField(this.#element, protectedCredentialFieldPolicy))
        return "";
      return typeof this.#element.validationMessage === "string"
        ? this.#element.validationMessage
        : "";
    }

    get validity() {
      return makeReadonlyValidityState(this.#element.validity);
    }

    get value() {
      if (isProtectedCredentialField(this.#element, protectedCredentialFieldPolicy))
        return this.#element.value ? "<redacted>" : "";
      return typeof this.#element.value === "string" ? this.#element.value : "";
    }

    get valueAsNumber() {
      if (isProtectedCredentialField(this.#element, protectedCredentialFieldPolicy))
        return null;
      return this.#element.valueAsNumber ?? null;
    }

    get audioTracks() {
      return makeReadonlyTrackList(this.#element.audioTracks);
    }

    get videoHeight() {
      return this.#element.videoHeight ?? 0;
    }

    get videoTracks() {
      return makeReadonlyTrackList(this.#element.videoTracks);
    }

    get videoWidth() {
      return this.#element.videoWidth ?? 0;
    }

    get width() {
      return this.#element.width ?? 0;
    }

    get willValidate() {
      return this.#element.willValidate === true;
    }

    closest(selector) {
      return wrapNode(this.#element.closest(String(selector)));
    }

    getAttribute(name) {
      const attributeName = String(name);
      if (
        attributeName.toLowerCase() === "value" &&
        isProtectedCredentialField(this.#element, protectedCredentialFieldPolicy)
      )
        return null;
      return this.#element.getAttribute(attributeName);
    }

    getBoundingClientRect() {
      return makeReadonlyRect(this.#element.getBoundingClientRect());
    }

    getClientRects() {
      return makeReadonlyList(
        Array.from(this.#element.getClientRects(), makeReadonlyRect),
      );
    }

    getElementsByClassName(className) {
      return makeReadonlyNodeList(
        this.#element.getElementsByClassName(String(className)),
      );
    }

    getElementsByTagName(tagName) {
      return makeReadonlyNodeList(
        this.#element.getElementsByTagName(String(tagName)),
      );
    }

    hasAttribute(name) {
      return this.#element.hasAttribute(String(name));
    }

    matches(selector) {
      return this.#element.matches(String(selector));
    }

    querySelector(selector) {
      return wrapNode(this.#element.querySelector(String(selector)));
    }

    querySelectorAll(selector) {
      return makeReadonlyNodeList(
        this.#element.querySelectorAll(String(selector)),
      );
    }

    scroll(leftOrOptions, top) {
      this.scrollTo(leftOrOptions, top);
    }

    scrollBy(leftOrOptions, top) {
      if (typeof this.#element.scrollBy !== "function") {
        return;
      }
      if (
        leftOrOptions != null &&
        typeof leftOrOptions === "object" &&
        !Array.isArray(leftOrOptions)
      ) {
        this.#element.scrollBy({ ...leftOrOptions });
        return;
      }
      this.#element.scrollBy(Number(leftOrOptions ?? 0), Number(top ?? 0));
    }

    scrollIntoView(arg) {
      if (typeof this.#element.scrollIntoView !== "function") {
        return;
      }
      if (arg == null || typeof arg === "boolean") {
        this.#element.scrollIntoView(arg);
        return;
      }
      if (typeof arg === "object" && !Array.isArray(arg)) {
        this.#element.scrollIntoView({ ...arg });
        return;
      }
      this.#element.scrollIntoView(Boolean(arg));
    }

    scrollTo(leftOrOptions, top) {
      if (typeof this.#element.scrollTo !== "function") {
        return;
      }
      if (
        leftOrOptions != null &&
        typeof leftOrOptions === "object" &&
        !Array.isArray(leftOrOptions)
      ) {
        this.#element.scrollTo({ ...leftOrOptions });
        return;
      }
      this.#element.scrollTo(Number(leftOrOptions ?? 0), Number(top ?? 0));
    }

    toJSON() {
      return {
        id: this.id,
        tagName: this.tagName,
        textContent: this.textContent,
      };
    }
  }

  class ReadonlyDocumentFragment extends ReadonlyNode {
    #fragment;

    constructor(fragment, token) {
      super(fragment, token);
      this.#fragment = fragment;
      Object.freeze(this);
    }

    get activeElement() {
      return wrapNode(this.#fragment.activeElement);
    }

    get adoptedStyleSheets() {
      return makeReadonlyList(
        Array.from(this.#fragment.adoptedStyleSheets ?? [], wrapCSSStyleSheet),
      );
    }

    get childElementCount() {
      return this.#fragment.childElementCount ?? this.children.length;
    }

    get children() {
      return makeReadonlyNodeList(this.#fragment.children);
    }

    get firstElementChild() {
      return wrapNode(this.#fragment.firstElementChild);
    }

    get host() {
      return wrapNode(this.#fragment.host);
    }

    get innerHTML() {
      return makeReadonlyHtml(this.#fragment, false);
    }

    get lastElementChild() {
      return wrapNode(this.#fragment.lastElementChild);
    }

    get mode() {
      return typeof this.#fragment.mode === "string"
        ? this.#fragment.mode
        : undefined;
    }

    get styleSheets() {
      return makeReadonlyList(
        Array.from(this.#fragment.styleSheets ?? [], wrapCSSStyleSheet),
      );
    }

    getElementById(id) {
      return typeof this.#fragment.getElementById === "function"
        ? wrapNode(this.#fragment.getElementById(String(id)))
        : null;
    }

    querySelector(selector) {
      return typeof this.#fragment.querySelector === "function"
        ? wrapNode(this.#fragment.querySelector(String(selector)))
        : null;
    }

    querySelectorAll(selector) {
      return makeReadonlyNodeList(
        typeof this.#fragment.querySelectorAll === "function"
          ? this.#fragment.querySelectorAll(String(selector))
          : [],
      );
    }
  }

  class ReadonlyDocument extends ReadonlyNode {
    #document;

    constructor(document, token) {
      super(document, token);
      this.#document = document;
      Object.freeze(this);
    }

    get activeElement() {
      return wrapNode(this.#document.activeElement);
    }

    get body() {
      return wrapNode(this.#document.body);
    }

    get characterSet() {
      return this.#document.characterSet;
    }

    get cookie() {
      return undefined;
    }

    get contentType() {
      return this.#document.contentType;
    }

    get defaultView() {
      return windowObject;
    }

    get adoptedStyleSheets() {
      return makeReadonlyList(
        Array.from(this.#document.adoptedStyleSheets ?? [], wrapCSSStyleSheet),
      );
    }

    get compatMode() {
      return this.#document.compatMode;
    }

    get doctype() {
      return wrapNode(this.#document.doctype);
    }

    get documentElement() {
      return wrapNode(this.#document.documentElement);
    }

    get fonts() {
      return wrapFontFaceSet(this.#document.fonts);
    }

    get forms() {
      return makeReadonlyNodeList(this.#document.forms);
    }

    get head() {
      return wrapNode(this.#document.head);
    }

    get hidden() {
      return this.#document.hidden === true;
    }

    get images() {
      return makeReadonlyNodeList(this.#document.images);
    }

    get lastModified() {
      return this.#document.lastModified;
    }

    get links() {
      return makeReadonlyNodeList(this.#document.links);
    }

    get location() {
      return locationObject;
    }

    get readyState() {
      return this.#document.readyState;
    }

    get referrer() {
      return this.#document.referrer;
    }

    get scripts() {
      return makeReadonlyNodeList(this.#document.scripts);
    }

    get scrollingElement() {
      return wrapNode(this.#document.scrollingElement);
    }

    get styleSheets() {
      return makeReadonlyList(
        Array.from(this.#document.styleSheets ?? [], wrapCSSStyleSheet),
      );
    }

    get title() {
      return this.#document.title;
    }

    get URL() {
      return this.#document.URL;
    }

    get visibilityState() {
      return this.#document.visibilityState;
    }

    elementFromPoint(x, y) {
      return typeof this.#document.elementFromPoint === "function"
        ? wrapNode(this.#document.elementFromPoint(Number(x), Number(y)))
        : null;
    }

    elementsFromPoint(x, y) {
      return makeReadonlyNodeList(
        typeof this.#document.elementsFromPoint === "function"
          ? this.#document.elementsFromPoint(Number(x), Number(y))
          : [],
      );
    }

    createRange() {
      return wrapRange(this.#document.createRange());
    }

    getElementById(id) {
      return wrapNode(this.#document.getElementById(String(id)));
    }

    getElementsByClassName(className) {
      return makeReadonlyNodeList(
        this.#document.getElementsByClassName(String(className)),
      );
    }

    getElementsByName(name) {
      return makeReadonlyNodeList(
        this.#document.getElementsByName(String(name)),
      );
    }

    getElementsByTagName(tagName) {
      return makeReadonlyNodeList(this.#document.getElementsByTagName(String(tagName)));
    }

    querySelector(selector) {
      return wrapNode(this.#document.querySelector(String(selector)));
    }

    querySelectorAll(selector) {
      return makeReadonlyNodeList(
        this.#document.querySelectorAll(String(selector)),
      );
    }
  }

  // Raw DOM references are closure-owned, not methods on exposed wrappers.
  // That keeps helper APIs like contains() and getComputedStyle() usable without
  // adding a model-visible path back to the mutable DOM.
  const unwrapNode = (value) =>
    value != null && (typeof value === "object" || typeof value === "function")
      ? rawNodesByWrapper.get(value) ?? null
      : null;
  const unwrapElement = (value) => {
    const node = unwrapNode(value);
    return node?.nodeType === ELEMENT_NODE ? node : null;
  };

  const isElement = (node) => node?.nodeType === ELEMENT_NODE;
  const isDocument = (node) => node?.nodeType === DOCUMENT_NODE;
  const isDocumentFragment = (node) => node?.nodeType === DOCUMENT_FRAGMENT_NODE;

  const wrapNode = (node) => {
    if (node == null) return null;
    const existing = nodeWrappers.get(node);
    if (existing != null) return existing;
    const wrapper = isDocument(node)
      ? new ReadonlyDocument(node, wrapperToken)
      : isElement(node)
        ? new ReadonlyElement(node, wrapperToken)
        : isDocumentFragment(node)
          ? new ReadonlyDocumentFragment(node, wrapperToken)
          : new ReadonlyNode(node, wrapperToken);
    nodeWrappers.set(node, wrapper);
    return wrapper;
  };

  const wrapNodeCollectionResult = (value) => {
    if (value == null) return null;
    if (typeof value.nodeType === "number") return wrapNode(value);
    if (
      (typeof value === "object" || typeof value === "function") &&
      typeof value.length === "number"
    ) {
      return makeReadonlyNodeList(value);
    }
    return null;
  };

  const makeReadonlyNodeList = (nodes) => {
    const rawNodes = Array.from(nodes ?? []);
    return makeReadonlyList(rawNodes.map(wrapNode), (list) => {
      defineHiddenReadonly(list, "namedItem", (name) => {
        const key = String(name);
        const rawNamedItem =
          typeof nodes?.namedItem === "function"
            ? nodes.namedItem(key)
            : (rawNodes.find((node) => node?.id === key || node?.name === key) ??
              null);
        return wrapNodeCollectionResult(rawNamedItem);
      });
    });
  };

  const locationObject = new ReadonlyLocation();
  const windowObject = Object.create(null);
  const documentObject = wrapNode(rawDocument);

  const safeGetComputedStyle = (element, pseudoElement) => {
    const rawElement = unwrapElement(element);
    if (rawElement == null) throw new TypeError("getComputedStyle expects an Element");
    return wrapStyle(rawWindow.getComputedStyle(rawElement, pseudoElement));
  };

  const safeGetSelection = () =>
    typeof rawWindow.getSelection === "function"
      ? wrapSelection(rawWindow.getSelection())
      : null;

  const safeMatchMedia = (query) => {
    if (typeof rawWindow.matchMedia !== "function") return null;
    return wrapMediaQueryList(rawWindow.matchMedia(String(query)));
  };

  const isScrollOptionsObject = (value) =>
    value != null && typeof value === "object" && !Array.isArray(value);

  const finiteNumber = (value, fallback) => {
    if (value == null) return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const safeWindowScrollTo = (leftOrOptions, top) => {
    if (typeof rawWindow.scrollTo !== "function") {
      throw new TypeError("scrollTo is not available");
    }
    if (isScrollOptionsObject(leftOrOptions)) {
      rawWindow.scrollTo({ ...leftOrOptions });
      return;
    }
    rawWindow.scrollTo(
      finiteNumber(leftOrOptions, 0),
      finiteNumber(top, 0),
    );
  };

  const safeWindowScrollBy = (leftOrOptions, top) => {
    const currentX = finiteNumber(rawWindow.scrollX, 0);
    const currentY = finiteNumber(rawWindow.scrollY, 0);
    if (typeof rawWindow.scrollBy === "function") {
      if (isScrollOptionsObject(leftOrOptions)) {
        rawWindow.scrollBy({ ...leftOrOptions });
        return;
      }
      rawWindow.scrollBy(
        finiteNumber(leftOrOptions, 0),
        finiteNumber(top, 0),
      );
      return;
    }
    if (isScrollOptionsObject(leftOrOptions)) {
      safeWindowScrollTo({
        left: currentX + finiteNumber(leftOrOptions.left, 0),
        top: currentY + finiteNumber(leftOrOptions.top, 0),
      });
      return;
    }
    safeWindowScrollTo(
      currentX + finiteNumber(leftOrOptions, 0),
      currentY + finiteNumber(top, 0),
    );
  };

  const safeSetTimeout = (callback, delay, ...args) => {
    if (typeof callback !== "function") {
      throw new TypeError("setTimeout callback must be a function");
    }
    if (typeof rawWindow.setTimeout !== "function") {
      throw new TypeError("setTimeout is not available");
    }
    return rawWindow.setTimeout(
      () => {
        callback(...args);
      },
      finiteNumber(delay, 0),
    );
  };

  const safeClearTimeout = (timeoutId) => {
    if (typeof rawWindow.clearTimeout === "function") {
      rawWindow.clearTimeout(timeoutId);
    }
  };

  const cssObject = Object.freeze({
    escape:
      typeof rawWindow.CSS?.escape === "function"
        ? (value) => rawWindow.CSS.escape(String(value))
        : undefined,
    supports:
      typeof rawWindow.CSS?.supports === "function"
        ? (property, value) =>
            value === undefined
              ? rawWindow.CSS.supports(String(property))
              : rawWindow.CSS.supports(String(property), String(value))
        : undefined,
  });

  defineHiddenReadonly(windowObject, "constructor", undefined);
  defineReadonly(windowObject, "CSS", cssObject);
  defineReadonly(windowObject, "document", documentObject);
  defineReadonly(windowObject, "location", locationObject);
  defineReadonly(windowObject, "self", windowObject);
  defineReadonly(windowObject, "top", windowObject);
  defineReadonly(windowObject, "window", windowObject);
  defineReadonly(windowObject, "getComputedStyle", safeGetComputedStyle);
  defineReadonly(windowObject, "getSelection", safeGetSelection);
  defineReadonly(windowObject, "matchMedia", safeMatchMedia);
  defineReadonly(windowObject, "clearTimeout", safeClearTimeout);
  defineReadonly(windowObject, "scroll", safeWindowScrollTo);
  defineReadonly(windowObject, "scrollBy", safeWindowScrollBy);
  defineReadonly(windowObject, "scrollTo", safeWindowScrollTo);
  defineReadonly(windowObject, "setTimeout", safeSetTimeout);
  defineReadonly(
    windowObject,
    "visualViewport",
    wrapVisualViewport(rawWindow.visualViewport),
  );
  for (const name of [
    "devicePixelRatio",
    "innerHeight",
    "innerWidth",
    "outerHeight",
    "outerWidth",
    "pageXOffset",
    "pageYOffset",
    "scrollX",
    "scrollY",
  ]) {
    defineReadonlyGetter(windowObject, name, () => rawWindow[name]);
  }
  Object.freeze(windowObject);

  const consoleObject = Object.freeze({
    debug() {},
    error() {},
    info() {},
    log() {},
    warn() {},
  });

  const cssRuleObject = Object.freeze({
    CHARSET_RULE: rawWindow.CSSRule?.CHARSET_RULE ?? 2,
    FONT_FACE_RULE: rawWindow.CSSRule?.FONT_FACE_RULE ?? 5,
    IMPORT_RULE: rawWindow.CSSRule?.IMPORT_RULE ?? 3,
    KEYFRAME_RULE: rawWindow.CSSRule?.KEYFRAME_RULE ?? 8,
    KEYFRAMES_RULE: rawWindow.CSSRule?.KEYFRAMES_RULE ?? 7,
    MEDIA_RULE: rawWindow.CSSRule?.MEDIA_RULE ?? 4,
    NAMESPACE_RULE: rawWindow.CSSRule?.NAMESPACE_RULE ?? 10,
    PAGE_RULE: rawWindow.CSSRule?.PAGE_RULE ?? 6,
    STYLE_RULE: rawWindow.CSSRule?.STYLE_RULE ?? 1,
    SUPPORTS_RULE: rawWindow.CSSRule?.SUPPORTS_RULE ?? 12,
  });

  const nodeObject = Object.freeze({
    COMMENT_NODE,
    DOCUMENT_FRAGMENT_NODE,
    DOCUMENT_NODE,
    DOCUMENT_TYPE_NODE,
    ELEMENT_NODE,
    TEXT_NODE,
  });
  const rangeObject = Object.freeze({
    END_TO_END: rawWindow.Range?.END_TO_END ?? 2,
    END_TO_START: rawWindow.Range?.END_TO_START ?? 3,
    START_TO_END: rawWindow.Range?.START_TO_END ?? 1,
    START_TO_START: rawWindow.Range?.START_TO_START ?? 0,
  });
  for (const name of ["createObjectURL", "revokeObjectURL"]) {
    defineHiddenReadonly(URL, name, undefined);
  }
  for (const namespace of [
    JSON,
    Math,
    Reflect,
    consoleObject,
    cssObject,
    cssRuleObject,
    nodeObject,
    rangeObject,
  ]) {
    Object.freeze(namespace);
  }

  // This object is the global allowlist used by the scope proxy below.
  // Anything not listed here resolves as undefined instead of falling through
  // to the isolated world's real global.
  const safeBindings = Object.freeze({
    Array,
    Boolean,
    console: consoleObject,
    CSS: cssObject,
    CSSRule: cssRuleObject,
    CSSRuleList: Array,
    CSSStyleDeclaration: ReadonlyStyleDeclaration,
    CSSStyleSheet: ReadonlyCSSStyleSheet,
    Date,
    document: documentObject,
${e==null?"":`    element: wrapNode(${e}),
`}    Element: ReadonlyElement,
${r==null?"":`    elements: makeReadonlyList(Array.from(${r}, wrapNode)),
`}    DocumentFragment: ReadonlyDocumentFragment,
    Error,
    getComputedStyle: safeGetComputedStyle,
    getSelection: safeGetSelection,
    HTMLCollection: Array,
    Infinity,
    isFinite,
    isNaN,
    JSON,
    location: locationObject,
    Map,
    Math,
    matchMedia: safeMatchMedia,
    MediaList: Array,
    NaN,
    Node: nodeObject,
    NodeList: Array,
    Number,
    Object,
    Promise,
    RangeError,
    Range: rangeObject,
    ReferenceError,
    Reflect,
    RegExp,
    Set,
    Selection: ReadonlySelection,
    String,
    StyleSheetList: Array,
    Symbol,
    ShadowRoot: ReadonlyDocumentFragment,
    clearTimeout: safeClearTimeout,
    scroll: safeWindowScrollTo,
    scrollBy: safeWindowScrollBy,
    scrollTo: safeWindowScrollTo,
    setTimeout: safeSetTimeout,
    TypeError,
    undefined,
    URIError,
    URL,
    URLSearchParams,
    visualViewport: windowObject.visualViewport,
    window: windowObject,
    self: windowObject,
    top: windowObject,
  });

  // The with-scope proxy claims every identifier lookup made by the user
  // script, so unlisted globals cannot leak through.
  const scope = new Proxy(Object.create(null), {
    defineProperty() {
      throw readonlyError("global defineProperty");
    },
    deleteProperty() {
      throw readonlyError("global delete");
    },
    get(_target, property) {
      if (property === Symbol.unscopables) return undefined;
      if (typeof property !== "string") return undefined;
      if (Object.prototype.hasOwnProperty.call(safeBindings, property)) {
        return safeBindings[property];
      }
      if (Object.prototype.hasOwnProperty.call(windowObject, property)) {
        return windowObject[property];
      }
      return undefined;
    },
    has() {
      return true;
    },
    set() {
      throw readonlyError("global assignment");
    },
  });

  const poisonConstructor = (prototype) => {
    try {
      Object.defineProperty(prototype, "constructor", {
        configurable: false,
        enumerable: false,
        value: undefined,
        writable: false,
      });
    } catch {}
  };

  // User code can create functions/classes/objects inside the isolated world.
  // Hide constructor links and freeze exposed intrinsics before it runs so those
  // objects cannot be used to climb back to a broader global or mutate helpers
  // that serialization relies on.
  const lockdownConstructors = (constructors) => {
    for (const constructor of constructors) {
      poisonConstructor(constructor.prototype);
      Object.freeze(constructor.prototype);
      Object.freeze(constructor);
    }
  };

  lockdownConstructors([
    Object,
    Function,
    Array,
    Promise,
    Map,
    Set,
    WeakMap,
    WeakSet,
    RegExp,
    Error,
    Number,
    String,
    Boolean,
    Date,
    URL,
    URLSearchParams,
    ReadonlyStyleDeclaration,
    ReadonlyMediaList,
    ReadonlyCSSRule,
    ReadonlyCSSStyleSheet,
    ReadonlyRange,
    ReadonlySelection,
    ReadonlyFontFaceSet,
    ReadonlyMediaQueryList,
    ReadonlyVisualViewport,
    ReadonlyLocation,
    ReadonlyNode,
    ReadonlyElement,
    ReadonlyDocumentFragment,
    ReadonlyDocument,
  ]);

  for (const prototype of [
    Object.getPrototypeOf(async function () {}),
    Object.getPrototypeOf(function* () {}),
    Object.getPrototypeOf(async function* () {}),
  ]) {
    if (prototype != null) {
      poisonConstructor(prototype);
      Object.freeze(prototype);
    }
  }

  const serializeResult = (value) => {
    // Runtime.evaluate returns only this bounded JSON-ish projection. Live DOM
    // wrappers never cross the boundary back to the caller.
    const seen = new WeakSet();

    const serializeNonObject = (current) => {
      switch (typeof current) {
        case "bigint":
          return current.toString();
        case "boolean":
        case "undefined":
          return current;
        case "function":
        case "symbol":
          return undefined;
        case "number":
          return Number.isFinite(current) ? current : null;
        case "string":
          return current.length > RESULT_MAX_STRING_LENGTH
            ? current.slice(0, RESULT_MAX_STRING_LENGTH) + "[Truncated]"
            : current;
        default:
          return current;
      }
    };

    const serializeArray = (items, depth) =>
      items
        .slice(0, RESULT_MAX_ARRAY_LENGTH)
        .map((item) => serialize(item, depth + 1));

    const serializeObject = (current, depth) => {
      if (depth > RESULT_MAX_DEPTH) return "[MaxDepth]";
      if (seen.has(current)) return "[Circular]";
      seen.add(current);
      if (
        rawNodesByWrapper.has(current) ||
        styleWrappers.has(current) ||
        cssWrappers.has(current) ||
        selectionAndRangeWrappers.has(current) ||
        readonlyApiWrappers.has(current)
      ) {
        return serialize(current.toJSON(), depth);
      }
      if (Array.isArray(current)) return serializeArray(current, depth);
      const output = {};
      for (const key of ownKeys(current)) {
        const serialized = serialize(current[key], depth + 1);
        if (serialized !== undefined) output[key] = serialized;
      }
      return output;
    };

    const serialize = (current, depth) =>
      current == null || typeof current !== "object"
        ? serializeNonObject(current)
        : serializeObject(current, depth);

    return serialize(value, 0);
  };

  const runUserScript = async () => {
    with (scope) {
      return await (async function () {
        "use strict";
${t}
      }).call(windowObject);
    }
  };

  return runUserScript().then(serializeResult);
})()`}

export function serializeReadonlyEvaluateScript(pageFunction, arg, mode = 'page') {
  const name = mode === 'all' ? 'locator.evaluateAll' : mode === 'element' ? 'locator.evaluate' : 'playwright.evaluate';
  let json = 'undefined';
  if (arg !== undefined) {
    try { json = JSON.stringify(arg); }
    catch (cause) { throw new Error('playwright.evaluate arg must be JSON-serializable', { cause }); }
    if (json === undefined) throw new Error('playwright.evaluate arg must be JSON-serializable');
  }
  if (typeof pageFunction === 'string') {
    if (!pageFunction.length) throw new Error(name + ' requires a pageFunction');
    return `const arg = ${json};\nreturn (${pageFunction});`;
  }
  const source = typeof pageFunction === 'function' ? pageFunction.toString() : pageFunction?.$function;
  if (typeof source !== 'string' || !source.length) throw new Error(name + ' requires a string or function');
  const callArgs = mode === 'all' ? 'elements, arg' : mode === 'element' ? 'element, arg' : 'arg';
  return `const arg = ${json};\nconst __playwrightEvaluate = (${source});\nreturn await __playwrightEvaluate(${callArgs});`;
}

const sessions = new WeakMap();
const worldName = 'browser-use-readonly-js';
const cleanupTimeoutMs = 100;
const contextDestroyed = error => /Cannot find context|Execution context was destroyed|context.*destroyed|context.*not found/i.test(String(error?.message ?? error));
const strictFailure = error => String(error?.message ?? error).includes('strict mode violation:');
const wrongDocument = error => String(error?.message ?? error).includes('Node with given id does not belong to the document');

function remaining(budget) {
  budget.signal?.throwIfAborted();
  const duration = budget.deadline - Date.now();
  if (duration <= 0) throw new Error('playwright.evaluate exceeded its deadline');
  return Math.max(1, Math.min(budget.timeoutMs, duration));
}

async function withBudget(operation, budget, onLate) {
  const duration = remaining(budget);
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      budget.signal?.removeEventListener('abort', abort);
      handler(value);
      return true;
    };
    const abort = () => finish(reject, budget.signal.reason);
    const timer = setTimeout(() => finish(reject, new Error('playwright.evaluate exceeded its deadline')), duration);
    budget.signal?.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      budget.signal?.throwIfAborted();
      return operation();
    }).then(value => {
      if (!finish(resolve, value) && onLate) {
        void Promise.resolve().then(() => onLate(value)).catch(() => {});
      }
    }, error => {
      if (!finish(reject, error) && onLate) {
        void Promise.resolve().then(() => onLate(undefined)).catch(() => {});
      }
    });
  });
}

const responseObjectIds = response => [
  response?.result?.objectId,
  response?.object?.objectId,
  response?.exceptionDetails?.exception?.objectId,
].filter(Boolean);

async function send(cdp, method, params, budget, onLate) {
  return await withBudget(() => cdp.send(method, params), budget, async response => {
    await cleanup(cdp, undefined, [], responseObjectIds(response));
    await onLate?.(response);
  });
}

async function disposeHandles(value) {
  const handles = Array.isArray(value) ? value : [value];
  await Promise.all(handles.filter(Boolean).map(async handle => {
    try { await handle.dispose(); } catch {}
  }));
}

function resultValue(response) {
  if (response.exceptionDetails != null) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Runtime.evaluate failed');
  }
  const result = response.result;
  if (result == null) return undefined;
  const value = result.unserializableValue;
  if (value == null) return result.value;
  if (value === '-0') return -0;
  if (value === 'NaN' || value === 'Infinity' || value === '-Infinity') return null;
  return /^-?\d+n$/.test(value) ? value.slice(0, -1) : value;
}

async function session(cdp, budget) {
  let state = sessions.get(cdp);
  if (!state) {
    state = { cdp, defaults: new Map(), worlds: new Map(), ready: undefined };
    sessions.set(cdp, state);
    const listeners = [];
    const listen = (event, handler) => { listeners.push([event, handler]); cdp.on(event, handler); };
    listen('Runtime.executionContextCreated', ({ context }) => {
      if (context.auxData?.isDefault === true) state.defaults.set(context.auxData.frameId, context.id);
    });
    listen('Runtime.executionContextDestroyed', ({ executionContextId }) => {
      for (const [frameId, id] of state.defaults) if (id === executionContextId) state.defaults.delete(frameId);
      for (const [frameId, entry] of state.worlds) if (entry.id === executionContextId) state.worlds.delete(frameId);
    });
    listen('Runtime.executionContextsCleared', () => { state.defaults.clear(); state.worlds.clear(); });
    listen('Page.frameNavigated', ({ frame }) => {
      if (!frame.parentId) state.worlds.clear();
      else state.worlds.delete(frame.id);
    });
    listen('Page.frameDetached', ({ frameId }) => { state.defaults.delete(frameId); state.worlds.delete(frameId); });
    state.ready = send(cdp, 'Runtime.enable', {}, budget).catch(error => {
      sessions.delete(cdp);
      for (const [event, handler] of listeners) cdp.off(event, handler);
      throw error;
    });
  }
  await withBudget(() => state.ready, budget);
  return state;
}

async function readonlyWorld(state, frameId, budget) {
  for (;;) {
    let entry = state.worlds.get(frameId);
    if (!entry) {
      entry = {};
      state.worlds.set(frameId, entry);
      entry.pending = send(state.cdp, 'Page.createIsolatedWorld', {
        frameId, grantUniveralAccess: false, worldName,
      }, budget).then(({ executionContextId }) => {
        entry.id = executionContextId;
        if (state.worlds.get(frameId) === entry && state.worlds.size > 20) {
          for (const [id, candidate] of state.worlds) if (candidate !== entry && candidate.id != null) {
            state.worlds.delete(id); break;
          }
        }
        return executionContextId;
      }).catch(error => {
        if (state.worlds.get(frameId) === entry) state.worlds.delete(frameId);
        throw error;
      });
    }
    const id = await withBudget(() => entry.pending, budget);
    if (state.worlds.get(frameId) === entry) return { id, entry };
  }
}

async function cleanup(cdp, contextId, names, objectIds) {
  const budget = () => ({ timeoutMs: cleanupTimeoutMs, deadline: Date.now() + cleanupTimeoutMs });
  const ids = new Set(objectIds);
  if (names.length) {
    const response = await send(cdp, 'Runtime.evaluate', {
      contextId, expression: names.map(name => `delete globalThis[${JSON.stringify(name)}]`).join(';'), returnByValue: true,
    }, budget()).catch(() => undefined);
    for (const objectId of responseObjectIds(response)) ids.add(objectId);
  }
  for (const objectId of ids) if (objectId) {
    await send(cdp, 'Runtime.releaseObject', { objectId }, budget()).catch(() => {});
  }
}

async function bindingFor(record, frame, frameBindings, budget) {
  if (frame?.isDetached()) throw new Error('Element is not connected');
  if (frameBindings) {
    const bindings = await withBudget(frameBindings, budget);
    const binding = bindings.find(value => value.frame === frame);
    if (binding) return binding;
    throw new Error('Frame target is not available for this iframe selector path');
  }
  if (frame !== record.page.mainFrame()) throw new Error('Readonly locator evaluation requires the selected frame CDP binding');
  const { frameTree } = await send(record.cdp, 'Page.getFrameTree', {}, budget);
  if (!frameTree?.frame?.id) throw new Error('playwright.evaluate could not find a frame');
  return { frame, cdp: record.cdp, frameId: frameTree.frame.id };
}

async function transferElement(handle, state, frameId, contextId, slot, budget) {
  const mainSlot = '__browserUseReadonlyTransfer' + randomUUID().replaceAll('-', '');
  const defaultId = state.defaults.get(frameId);
  if (defaultId == null) throw new Error('playwright.evaluate could not find the locator frame execution context');
  const objects = [];
  try {
    await withBudget(() => handle.evaluate((element, name) => {
      if (!element.isConnected) throw new Error('Element is not connected');
      Object.defineProperty(globalThis, name, { configurable: true, value: element });
    }, mainSlot), budget, () => cleanup(state.cdp, defaultId, [mainSlot], []));
    const resolved = await send(state.cdp, 'Runtime.evaluate', {
      contextId: defaultId, expression: `globalThis[${JSON.stringify(mainSlot)}]`, returnByValue: false,
    }, budget);
    objects.push(resolved.result?.objectId, resolved.exceptionDetails?.exception?.objectId);
    resultValue(resolved);
    if (!resolved.result?.objectId) throw new Error('playwright.evaluate could not resolve the locator element');
    const { node } = await send(state.cdp, 'DOM.describeNode', { objectId: resolved.result.objectId }, budget);
    const { object } = await send(state.cdp, 'DOM.resolveNode', {
      backendNodeId: node.backendNodeId, executionContextId: contextId,
    }, budget);
    objects.push(object?.objectId);
    if (!object?.objectId) throw new Error('playwright.evaluate could not resolve the locator element');
    const stored = await send(state.cdp, 'Runtime.callFunctionOn', {
      objectId: object.objectId, functionDeclaration: 'function (name) { globalThis[name] = this; }',
      arguments: [{ value: slot }], returnByValue: true,
    }, budget, () => cleanup(state.cdp, contextId, [slot], []));
    objects.push(stored.exceptionDetails?.exception?.objectId);
    resultValue(stored);
  } finally {
    await cleanup(state.cdp, defaultId, [mainSlot], objects);
  }
}

async function evaluateAttempt(record, script, budget, { locator, all, frame, frameBindings }) {
  let handles = [], binding, state, world, response;
  const slots = [], objectIds = [];
  try {
    if (locator) {
      handles = all
        ? await withBudget(() => locator.elementHandles(), budget, disposeHandles)
        : [await withBudget(() => locator.elementHandle({ timeout: remaining(budget) }), budget, disposeHandles)];
      if (!all && !handles[0]) throw new Error('Element is not connected');
      if (handles.length) {
        const frames = await withBudget(() => Promise.all(handles.map(handle => handle.ownerFrame())), budget);
        frame = frames[0];
        if (!frame || frames.some(candidate => candidate !== frame)) throw new Error('Readonly locator elements must belong to one document');
      }
    }
    frame ??= record.page.mainFrame();
    binding = await bindingFor(record, frame, frameBindings, budget);
    state = await session(binding.cdp, budget);
    world = await readonlyWorld(state, binding.frameId, budget);
    for (let index = 0; index < handles.length; index++) {
      const slot = '__browserUseReadonlyElement' + randomUUID().replaceAll('-', '');
      slots.push(slot);
      await transferElement(handles[index], state, binding.frameId, world.id, slot, budget);
    }
    const elementExpression = locator && !all ? `rawWindow[${JSON.stringify(slots[0])}]` : undefined;
    const elementsExpression = locator && all ? '[' + slots.map(slot => `rawWindow[${JSON.stringify(slot)}]`).join(',') + ']' : undefined;
    response = await send(binding.cdp, 'Runtime.evaluate', {
      awaitPromise: true, contextId: world.id,
      expression: buildReadonlyDomExpression(script, elementExpression, elementsExpression),
      returnByValue: true, timeout: remaining(budget),
    }, budget);
    objectIds.push(response.result?.objectId, response.exceptionDetails?.exception?.objectId);
    return response;
  } catch (error) {
    if (state && world && (contextDestroyed(error) || wrongDocument(error))) {
      if (state.worlds.get(binding.frameId) === world.entry) state.worlds.delete(binding.frameId);
    }
    throw error;
  } finally {
    if (binding && world) await cleanup(binding.cdp, world.id, slots, objectIds);
    await disposeHandles(handles);
  }
}

/**
 * Execute a page or resolved locator in Codex's recovered readonly DOM scope.
 * frameBindings must return public Playwright Frame/CDP/frameId bindings for iframe locators.
 */
export async function evaluateReadonly(record, pageFunction, arg, options = {}, scope = {}) {
  const requested = options?.timeoutMs ?? readonlyEvaluateLimits.timeoutMs;
  if (!Number.isInteger(requested) || requested <= 0) throw new TypeError('playwright.evaluate timeoutMs must be a positive integer');
  const timeoutMs = Math.min(requested, readonlyEvaluateLimits.timeoutMs);
  const budget = { timeoutMs, deadline: Date.now() + timeoutMs, signal: scope.signal };
  const script = serializeReadonlyEvaluateScript(pageFunction, arg, scope.locator ? scope.all ? 'all' : 'element' : 'page');
  gM(script);
  let retriedContext = false;
  for (;;) {
    let response;
    try { response = await evaluateAttempt(record, script, budget, scope); }
    catch (error) {
      budget.signal?.throwIfAborted();
      if (strictFailure(error)) throw error;
      if (!scope.locator || scope.all) {
        if (!contextDestroyed(error) || retriedContext) throw error;
        retriedContext = true;
      }
      if (Date.now() >= budget.deadline) {
        if (!scope.locator || scope.all) throw error;
        throw new Error(`Timed out after ${timeoutMs}ms evaluating selector: ${error.message ?? error}`, { cause: error });
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(100, budget.deadline - Date.now()))));
      continue;
    }
    return resultValue(response);
  }
}
