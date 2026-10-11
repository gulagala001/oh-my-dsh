import { BrowserAuthBrokerChallenge } from './browser-auth-broker.mjs';
import { fillBrowserAuthFieldInPage, submitBrowserAuthFormInPage } from './browser-auth-page-actions.mjs';
import {
  createBrowserAuthSubmissionGuard,
  closeBrowserAuthSubmissionGuard,
  containBrowserAuthDocuments,
} from './browser-auth-submission-guard.mjs';

// Recovered from Codex chrome/scripts/browser-service.mjs: sB, L_, oa through
// fJ, QX/ZX, and gS. Browser/native services are supplied by the caller; a
// missing service never selects a less protected credential-delivery path.
const FRAME_SEPARATOR = ' >> internal:control=enter-frame >> ';
const OTP_ID = 'otp';
const MAX_FIELD_LENGTH = 16 * 1024;
const AUTH_MESSAGE = 'Sign in to continue';
const UNSUPPORTED_ELICITATION = 'nodeRepl.createElicitation is unavailable because the MCP client does not support form elicitation';
const IDENTIFIER = /^[A-Za-z0-9_-]{1,48}$/;
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const USERNAME_TYPES = ['text', 'email', 'tel', 'number', 'search', 'url'];
const TERMINAL_STATUSES = new Set(['submitted', 'declined', 'cancelled', 'unavailable', 'expired',
  'origin_changed', 'page_changed', 'locator_invalid', 'submission_failed']);
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const required = (value, name) => {
  if (typeof value !== 'function') throw new Error(`Browser auth requires ${name}`);
  return value;
};

function hasCoreContext(ctx) {
  return ctx != null && typeof ctx.cdp?.call === 'function'
    && ['evaluateOnPlaywrightSelector', 'evaluateOnPlaywrightSelectorWithTarget',
      'evaluateOnPlaywrightSelectorAll', 'selectorsResolveToDistinctElements',
      'readElementState', 'withBoundPlaywrightSelector', 'clickLocator']
      .every(name => typeof ctx.playwright?.[name] === 'function')
    && object(ctx.runtime) && object(ctx.runtime.env)
    && typeof ctx.commandTiming?.trackElicitation === 'function'
    && typeof ctx.createBrowserAuthBrokerTransport === 'function'
    && typeof ctx.browserAuth?.getAutomatedSafetyPrecheck === 'function';
}

function validRequest(params) {
  if (!object(params) || typeof params.browser_id !== 'string' || typeof params.tab_id !== 'string'
    || !Number.isSafeInteger(Number(params.tab_id)) || Number(params.tab_id) <= 0
    || typeof params.origin !== 'string' || !Array.isArray(params.fields) || params.fields.length > 6
    || params.fields.some(field => !object(field) || typeof field.id !== 'string' || !IDENTIFIER.test(field.id)
      || RESERVED_IDS.has(field.id) || typeof field.label !== 'string'
      || typeof field.type !== 'string' || !field.type || typeof field.required !== 'boolean'
      || typeof field.selector !== 'string'
      || field.autocomplete != null && typeof field.autocomplete !== 'string')) return false;
  if (params.options != null && (!Array.isArray(params.options) || params.options.length < 2
    || params.options.length > 10 || params.options.some(option => !object(option)
      || typeof option.id !== 'string' || !IDENTIFIER.test(option.id) || RESERVED_IDS.has(option.id)
      || typeof option.label !== 'string' || !option.label.trim() || option.label.trim().length > 120
      || option.selector != null && typeof option.selector !== 'string'
      || option.field_ids != null && (!Array.isArray(option.field_ids) || option.field_ids.length > 6
        || option.field_ids.some(id => typeof id !== 'string'))
      || (option.selector != null) === ((option.field_ids?.length ?? 0) > 0)))) return false;
  if (params.submit != null && (!object(params.submit) || typeof params.submit.selector !== 'string'
    || !['click', 'press_enter'].includes(params.submit.action))) return false;
  if (params.qr_code !== undefined && params.qr_code !== true) return false;
  if (params.otpHandle != null && (typeof params.otpHandle !== 'string'
    || !params.otpHandle || params.otpHandle.length > 16384)) return false;
  if (params.fields.length === 0 && params.options == null && params.qr_code !== true) return false;
  const ids = new Set(), selectors = new Set();
  for (const field of params.fields) {
    if (ids.has(field.id) || selectors.has(field.selector)) return false;
    ids.add(field.id); selectors.add(field.selector);
  }
  const optionIds = new Set(), optionSelectors = new Set();
  for (const option of params.options ?? []) {
    if (optionIds.has(option.id)) return false;
    optionIds.add(option.id);
    if (option.selector != null) {
      if (optionSelectors.has(option.selector) || selectors.has(option.selector)) return false;
      optionSelectors.add(option.selector);
    }
    const fields = option.field_ids ?? [];
    if (new Set(fields).size !== fields.length || fields.some(id => !ids.has(id))) return false;
  }
  return params.submit == null || params.submit.action === 'press_enter'
    || !selectors.has(params.submit.selector);
}

function originOf(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : null;
  } catch { return null; }
}

function frameOriginOf(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'file:') { url.search = ''; url.hash = ''; return url.href; }
    return originOf(value);
  } catch { return null; }
}

function sessionId(runtime) {
  let metadata = runtime.requestMeta?.['x-codex-turn-metadata'];
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { return undefined; }
  }
  if (!object(metadata)) return undefined;
  if (metadata.thread_source === 'subagent' && typeof metadata.thread_id === 'string') return metadata.thread_id;
  return typeof metadata.session_id === 'string' ? metadata.session_id : undefined;
}

function qrOnly(params) {
  return params.qr_code === true && params.fields.length === 0 && params.options == null && params.submit == null;
}

function requestSelectors(params) {
  return [...params.fields.map(field => field.selector),
    ...params.submit == null ? [] : [params.submit.selector],
    ...(params.options ?? []).flatMap(option => option.selector == null ? [] : [option.selector])];
}

function sameDocument(a, b) {
  return a.frameId === b.frameId && a.loaderId === b.loaderId && a.url === b.url;
}

function sameSite(a, b) {
  return a.domainAndRegistry && b.domainAndRegistry
    ? a.domainAndRegistry === b.domainAndRegistry
    : new URL(a.url).hostname === new URL(b.url).hostname;
}

export async function readBrowserAuthPageBinding(tabId, expectedOrigin, ctx) {
  const { frameTree } = await ctx.cdp.call(Number(tabId), 'Page.getFrameTree');
  const { domainAndRegistry, id, loaderId, securityOrigin, url } = frameTree.frame;
  const origin = expectedOrigin ?? originOf(url);
  if (origin == null || originOf(securityOrigin) !== origin || originOf(url) !== origin) return 'origin_changed';
  if (!id || !loaderId || !securityOrigin || !url) return 'page_changed';
  return { domainAndRegistry: domainAndRegistry ?? '', frameId: id, loaderId, securityOrigin, url };
}

async function revalidatePage(tabId, origin, binding, ctx) {
  const current = await readBrowserAuthPageBinding(tabId, origin, ctx);
  return typeof current === 'string' ? current : sameDocument(binding, current) ? null : 'page_changed';
}

function targetKey(target) {
  return `${target.tabId}:${target.sessionId ?? ''}:${target.targetId ?? ''}`;
}

async function selectorBinding(tabId, selector, timeoutMs, ctx) {
  const { frameIdentity, result, target } = await ctx.playwright.evaluateOnPlaywrightSelectorWithTarget(
    tabId, selector, element => element.ownerDocument.defaultView?.location.href ?? window.location.href,
    { includeFrameIdentity: true, timeoutMs });
  if (frameIdentity == null) throw new Error('Browser auth frame has no document identity');
  const origin = frameOriginOf(frameIdentity.url);
  if (origin == null) throw new Error('Browser auth frame has no origin');
  if (frameIdentity.url !== result.split('#', 1)[0]) throw new Error('Browser auth frame URL mismatch');
  return { domainAndRegistry: frameIdentity.domainAndRegistry ?? '', frameId: frameIdentity.frameId,
    loaderId: frameIdentity.loaderId, origin, targetKey: targetKey(target), url: frameIdentity.url };
}

async function formBinding(params, ctx, fallbackSelector) {
  try {
    const selectors = [...params.fields.map(field => field.selector),
      ...params.submit == null ? [] : [params.submit.selector]];
    if (selectors.length === 0) selectors.push(fallbackSelector ?? 'html');
    const bindings = await Promise.all(selectors.map(selector => selectorBinding(
      params.tab_id, selector, params.timeout_ms, ctx)));
    const first = bindings[0];
    return first != null && bindings.every(binding => binding.targetKey === first.targetKey
      && binding.origin === first.origin && sameDocument(binding, first)) ? first : null;
  } catch { return null; }
}

async function optionBindings(params, ctx) {
  try {
    const bindings = new Map();
    await Promise.all((params.options ?? []).map(async option => {
      if (option.selector != null) bindings.set(option.id, await selectorBinding(
        params.tab_id, option.selector, params.timeout_ms, ctx));
    }));
    return bindings;
  } catch { return null; }
}

async function revalidateForm(params, binding, ctx, fallbackSelector) {
  const current = await formBinding(params, ctx, fallbackSelector);
  return current == null ? 'locator_invalid' : current.targetKey !== binding.targetKey ? 'page_changed'
    : current.origin !== binding.origin ? 'origin_changed' : sameDocument(binding, current) ? null : 'page_changed';
}

async function validateIntermediateFrames(page, form, params, ctx) {
  const selectors = new Set();
  for (const selector of requestSelectors(params)) {
    let depth = 0;
    for (const match of selector.matchAll(/>>\s*internal:control\s*=\s*enter-frame\s*>>/g)) {
      if (depth++ > 0) selectors.add(selector.slice(0, match.index).trimEnd());
    }
  }
  try {
    return (await Promise.all([...selectors].map(selector => selectorBinding(
      params.tab_id, selector, params.timeout_ms, ctx)))).every(binding => sameSite(page, binding) || sameSite(form, binding));
  } catch { return false; }
}

async function userVisibility(field, params, ctx, strict = false) {
  try {
    return await ctx.playwright.evaluateOnPlaywrightSelector(params.tab_id, field.selector,
      fillBrowserAuthFieldInPage, { arg: { operation: 'browser-auth-user-visibility', expectedType: field.type },
        isolatedWorld: true, strict, timeoutMs: params.timeout_ms });
  } catch { return null; }
}

async function controlVisible(selector, params, ctx, allowDisabled = false) {
  try {
    const locator = { browser_id: params.browser_id, tab_id: params.tab_id, selector, timeout_ms: params.timeout_ms };
    const [count, visible, enabled] = await Promise.all([
      ctx.playwright.evaluateOnPlaywrightSelectorAll(params.tab_id, selector, elements => elements.length),
      ctx.playwright.readElementState(locator, 'visible'), ctx.playwright.readElementState(locator, 'enabled'),
    ]);
    return count === 1 && visible === true && (enabled === true || allowDisabled);
  } catch { return false; }
}

async function distinctElements(tabId, selectors, params, ctx) {
  if (selectors.length < 2) return true;
  if (!selectors.some(selector => selector.includes(FRAME_SEPARATOR))) {
    return await ctx.playwright.selectorsResolveToDistinctElements(tabId, selectors, { timeoutMs: params.timeout_ms });
  }
  const identities = await Promise.all(selectors.map(async selector => {
    const { result, target } = await ctx.playwright.evaluateOnPlaywrightSelectorWithTarget(tabId, selector, element => {
      window.__codexBrowserAuthElementIds ??= new WeakMap();
      const existing = window.__codexBrowserAuthElementIds.get(element);
      if (existing != null) return existing;
      const id = String((window.__codexBrowserAuthElementIdCounter ?? 0) + 1);
      window.__codexBrowserAuthElementIdCounter = Number(id);
      window.__codexBrowserAuthElementIds.set(element, id);
      return id;
    }, { timeoutMs: params.timeout_ms });
    return `${targetKey(target)}:${result}`;
  }));
  return new Set(identities).size === identities.length;
}

async function validateLocators(params, ctx) {
  try {
    const selectors = params.fields.map(field => field.selector);
    for (const field of params.fields) if (await userVisibility(field, params, ctx, true) !== true) return false;
    if (!await distinctElements(params.tab_id, selectors, params, ctx)) return false;
    if (params.submit == null) return true;
    if (!await controlVisible(params.submit.selector, params, ctx, params.submit.action === 'click')) return false;
    return params.submit.action === 'press_enter'
      || await distinctElements(params.tab_id, [...selectors, params.submit.selector], params, ctx);
  } catch { return false; }
}

async function validateOptions(params, ctx) {
  try {
    if (params.options == null) return true;
    for (const option of params.options) {
      if (option.selector != null && !await controlVisible(option.selector, params, ctx)) return false;
    }
    return await distinctElements(params.tab_id, [...params.fields.map(field => field.selector),
      ...params.submit?.action === 'click' ? [params.submit.selector] : [],
      ...params.options.flatMap(option => option.selector == null ? [] : [option.selector])], params, ctx);
  } catch { return false; }
}

async function fieldMetadata(field, params, ctx, isolatedWorld = false) {
  try {
    return await ctx.playwright.evaluateOnPlaywrightSelector(params.tab_id, field.selector, (element, helper, request) => {
      if (element.tagName !== 'INPUT' || element.type !== request.expectedType) return null;
      const compact = value => {
        const text = value?.replace(/\s+/g, ' ').trim() ?? '';
        return text.length === 0 ? null : text.length <= 80 ? text : `${text.slice(0, 79)}\u2026`;
      };
      return { accessible_name: compact(helper.utils.getElementAccessibleName(element, false)),
        autocomplete: compact(element.autocomplete.toLowerCase()), input_type: element.type,
        input_mode: compact(element.inputMode.toLowerCase()), input_name: compact(element.name), required: element.required === true };
    }, { arg: { operation: 'browser-auth-field-label-metadata', expectedType: field.type },
      ...isolatedWorld ? { isolatedWorld: true } : {}, timeoutMs: params.timeout_ms });
  } catch { return null; }
}

async function validatedFields(params, ctx, isolatedWorld = false, skipLocatorValidation = false) {
  try {
    if (!skipLocatorValidation && !await validateLocators(params, ctx)) return null;
    const fields = [];
    for (const field of params.fields) {
      const metadata = await fieldMetadata(field, params, ctx, isolatedWorld);
      if (metadata == null) return null;
      const { required: nativeRequired, ...labelMetadata } = metadata;
      fields.push({ ...field, required: field.required || nativeRequired, labelMetadata });
    }
    return fields;
  } catch { return null; }
}

export function createBrowserAuthCredentialPlan(fields) {
  const first = fields[0];
  const combinedOtp = fields.length >= 4 && fields.every(field => field.autocomplete?.toLowerCase() === 'one-time-code'
    || field.labelMetadata.autocomplete === 'one-time-code' || field.labelMetadata.input_mode === 'numeric')
    && fields.every(field => field.type === first?.type);
  if (first != null && combinedOtp) return {
    credentialFieldMetadata: fields.map(({ labelMetadata }) => ({ id: OTP_ID, ...labelMetadata })),
    promptFields: [{ id: OTP_ID, label: 'Verification code', label_metadata: { ...first.labelMetadata,
      accessible_name: null, autocomplete: 'one-time-code', input_name: null }, type: first.type,
    autocomplete: 'one-time-code', required: true }], fillFields: [{ promptId: OTP_ID, fields }],
  };
  return { credentialFieldMetadata: fields.map(({ id, labelMetadata }) => ({ id, ...labelMetadata })),
    promptFields: fields.map(({ id, label, labelMetadata, type, autocomplete, required: fieldRequired }) => ({
      id, label, label_metadata: labelMetadata, type, autocomplete, required: fieldRequired,
    })), fillFields: fields.map(field => ({ promptId: field.id, fields: [field] })) };
}

function promptOptions(options, plan) {
  if (options == null) return undefined;
  const result = [];
  for (const option of options) {
    if (option.field_ids == null) { result.push(option); continue; }
    const selected = new Set(option.field_ids), ids = [];
    let mapped = 0;
    for (const { promptId, fields } of plan.fillFields) {
      const included = fields.filter(field => selected.has(field.id));
      if (included.length === 0) continue;
      if (included.length !== fields.length) return null;
      mapped += included.length; ids.push(promptId);
    }
    if (mapped !== selected.size) return null;
    result.push({ ...option, field_ids: ids });
  }
  return result;
}

function credentialPair(fields, passwordOnly = false) {
  const candidates = fields.map(({ id, labelMetadata, ...field }) => ({ ...field, id, labelMetadata,
    type: labelMetadata.input_type, autocomplete: labelMetadata.autocomplete, label: labelMetadata.accessible_name }))
    .filter(field => {
      const autocomplete = field.autocomplete?.toLowerCase().split(/\s+/) ?? [];
      const label = field.label?.replace(/[\p{Dash}_\s]+/gu, ' ') ?? '';
      return !autocomplete.includes('one-time-code') && !autocomplete.includes('new-password')
        && !/\b(?:[ht]?otp|one ?time(?: ?(?:password|passcode|code))?|verification code|security code|authentication code|2fa|mfa)\b/i.test(label);
    });
  const passwords = candidates.filter(field => field.type === 'password');
  const usernames = candidates.filter(field => {
    if (!USERNAME_TYPES.includes(field.type)) return false;
    if (field.autocomplete?.toLowerCase().split(/\s+/).includes('username')) return true;
    const label = field.label?.replace(/[\p{Dash}_\s]+/gu, ' ').trim() ?? '';
    if (/^(?:code|passcode|pin|token)[:*]?$/i.test(label)) return false;
    return field.type !== 'number'
      || /\b(?:user ?name|(?:user|login|account|customer|member|membership|rapid rewards) (?:id|number|no\.?))\b|^(?:account|login|user|member)[:*]?$/i.test(label);
  });
  const explicit = usernames.filter(field => field.autocomplete?.toLowerCase().split(/\s+/).includes('username'));
  const selected = explicit.length > 0 ? explicit : usernames;
  const username = selected.length === 1 ? selected[0] : undefined;
  const password = passwords.length === 1 ? passwords[0] : undefined;
  if (username != null && password != null && username.id !== password.id) return { username, password };
  if (passwordOnly && selected.length === 0 && password != null) return { password };
}

function credentialOptionAllowed(options, fields, usernameId, passwordId, version) {
  const matching = options?.filter(option => usernameId != null
    && option.field_ids?.includes(usernameId) && option.field_ids.includes(passwordId));
  if (matching != null && (version !== '1' || matching.length !== 1)) return false;
  const selected = matching?.[0]?.field_ids;
  return fields.every(field => !field.required || selected != null && !selected.includes(field.id)
    || field.id === usernameId || field.id === passwordId);
}

async function submissionTarget(params, ctx, requirePost = false) {
  if (params.submit?.selector == null) return null;
  try {
    return await ctx.playwright.evaluateOnPlaywrightSelector(params.tab_id, params.submit.selector, (element, _helper, request) => {
      const form = element.form;
      if (form == null) return null;
      const formValue = name => Reflect.get(HTMLFormElement.prototype, name, form);
      const submitter = node => (node instanceof HTMLButtonElement || node instanceof HTMLInputElement)
        && !node.disabled && (node.type === 'submit' || node.type === 'image');
      const control = submitter(element) ? element : Array.from(formValue('elements')).find(submitter);
      const method = control?.hasAttribute('formmethod') === true ? control.formMethod : formValue('method');
      if (request.requirePost && method !== 'post') return undefined;
      const action = control?.hasAttribute('formaction') === true ? control.formAction : formValue('action');
      try {
        const url = new URL(action);
        if (url.protocol === 'javascript:') return null;
        url.hash = '';
        return url.protocol === 'https:' ? { origin: url.origin, url: url.href } : undefined;
      } catch { return undefined; }
    }, { arg: { operation: 'browser-auth-submission-origin', requirePost }, isolatedWorld: true, timeoutMs: params.timeout_ms });
  } catch { return undefined; }
}

async function submissionOrigin(params, ctx, requirePost = false) {
  const target = await submissionTarget(params, ctx, requirePost);
  return target == null ? target : target.origin;
}

async function actionTargets(params, ctx) {
  const roots = requestSelectors(params).flatMap(selector => {
    const root = selector.split(FRAME_SEPARATOR)[0] ?? selector;
    return root === selector ? [selector] : [root, selector];
  });
  try {
    const contained = await Promise.all(roots.map(selector => ctx.playwright.evaluateOnPlaywrightSelector(
      params.tab_id, selector, element => {
        const view = element.ownerDocument.defaultView;
        if (view == null) return false;
        const root = element.ownerDocument.body ?? element.ownerDocument.documentElement;
        let current = element;
        while (!root.contains(current)) {
          const node = current.getRootNode();
          if (!(node instanceof view.ShadowRoot)) return false;
          current = node.host;
        }
        return true;
      }, { arg: { operation: 'browser-auth-snapshot-root' }, isolatedWorld: true, timeoutMs: params.timeout_ms })));
    if (!contained.every(Boolean)) return null;
  } catch { return null; }
  const origin = await submissionOrigin(params, ctx);
  if (origin === undefined) return null;
  const metadata = async selector => {
    try {
      const result = await ctx.playwright.evaluateOnPlaywrightSelector(params.tab_id, selector, (element, helper) => {
        const name = helper.utils.getElementAccessibleName(element, false).replace(/\s+/g, ' ').trim();
        return { accessible_name: name.length === 0 ? null : name.length <= 80 ? name : `${name.slice(0, 79)}\u2026`,
          origin: element.ownerDocument.defaultView?.location.origin ?? window.location.origin };
      }, { arg: { operation: 'browser-auth-action-target-metadata' }, isolatedWorld: true, timeoutMs: params.timeout_ms });
      return { selector, ...result };
    } catch { return null; }
  };
  const options = [];
  for (const option of params.options ?? []) {
    if (option.selector == null) continue;
    const target = await metadata(option.selector);
    if (target == null) return null;
    options.push({ id: option.id, ...target });
  }
  if (params.submit == null) return { options, submissionOrigin: origin };
  const submit = await metadata(params.submit.selector);
  return submit == null ? null : { options, submissionOrigin: origin, submit: { action: params.submit.action, ...submit } };
}

async function nativeBinding(params, fields, topOrigin, frameOrigin, ctx) {
  const id = sessionId(ctx.runtime);
  if (!id || id.length > 256 || params.qr_code === true || frameOrigin == null
    || topOrigin !== frameOrigin || new URL(topOrigin).protocol !== 'https:') return undefined;
  const pair = credentialPair(fields);
  if (pair?.username == null || pair.password == null || !credentialOptionAllowed(params.options,
    fields, pair.username.id, pair.password.id, ctx.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_OPTIONS_VERSION)) return undefined;
  const origin = await submissionOrigin(params, ctx, true);
  if (origin === frameOrigin) return { fields: [{ id: pair.username.id, kind: 'username' },
    { id: pair.password.id, kind: 'password' }], session_id: id, submission_origin: origin };
}

async function manualSaveBinding(params, fields, challengeFields, topOrigin, frameOrigin, ctx) {
  const ordinary = ctx.runtime.env.BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION === '10';
  const id = sessionId(ctx.runtime);
  if (!id || id.length > 256 || !ordinary && (fields.length !== 2 || fields.some(field => !field.required)
    || challengeFields.length !== 2 || challengeFields.some(field => !field.required) || params.options != null)
    || params.submit == null || params.qr_code === true || frameOrigin == null
    || topOrigin !== frameOrigin || new URL(topOrigin).protocol !== 'https:') return undefined;
  const passwordOnly = ordinary && ctx.runtime.env.BROWSER_AUTH_BROKER_PASSWORD_ONLY_VERSION === '1';
  const pair = credentialPair(fields, passwordOnly), username = pair?.username, password = pair?.password;
  if (username == null && !passwordOnly || password == null) return undefined;
  if (username == null && (fields.length !== 1 || challengeFields.length !== 1 || params.options != null)) return undefined;
  if (username != null && (username.id === password.id || !challengeFields.some(field => field.id === username.id))
    || !challengeFields.some(field => field.id === password.id)) return undefined;
  if (params.options != null && !params.options.some(option => (username == null || option.field_ids?.includes(username.id))
    && option.field_ids?.includes(password.id))) return undefined;
  if (ordinary) {
    const current = await validatedFields(params, ctx, true);
    const inspected = current == null ? undefined : credentialPair(current, passwordOnly);
    if (inspected?.username?.id !== username?.id || inspected?.password.id !== password.id) return undefined;
    if (!await containBrowserAuthDocuments(ctx.cdp, Number(params.tab_id), topOrigin, undefined, true)) return undefined;
    return { kind: 'ordinary', fields: { username: username?.id, password: password.id }, sessionId: id };
  }
  if (username == null) return undefined;
  const usernameName = username.labelMetadata.input_name, passwordName = password.labelMetadata.input_name;
  if (!usernameName || !passwordName || usernameName === passwordName || usernameName.length > 256 || passwordName.length > 256) return undefined;
  const target = await submissionTarget(params, ctx, true);
  if (target == null || target.origin !== frameOrigin
    || !await containBrowserAuthDocuments(ctx.cdp, Number(params.tab_id), target.origin)) return undefined;
  const submission = { username: { selector: username.selector, name: usernameName },
    password: { selector: password.selector, name: passwordName }, submit: params.submit, target };
  try {
    if (!await ctx.playwright.evaluateOnPlaywrightSelector(params.tab_id, username.selector, submitBrowserAuthFormInPage,
      { arg: submission, isolatedWorld: true, timeoutMs: params.timeout_ms })) return undefined;
  } catch { return undefined; }
  return { kind: 'private', fields: { username: username.id, password: password.id }, target,
    names: { username: usernameName, password: passwordName }, sessionId: id, submission };
}

export class BrowserAuthCheckpoint {
  constructor(params, ctx, page, form, options, plan, reviewedActionTargets) {
    Object.assign(this, { params, ctx, pageBinding: page, formBinding: form,
      optionBindings: options, credentialPlan: plan, reviewedActionTargets, currentOrigin: params.origin });
    if (form == null && !qrOnly(params)) throw new Error('Browser auth form binding is required for non-QR requests.');
  }
  nativeDelivery = false;
  manualCredentialSave = false;
  credentialSubmissionFields;
  ordinaryCredentialFields;
  manualSavingRejection;
  manualSubmission;
  ordinaryAttempt;
  completedOrdinaryFields = new Set();
  ordinaryReinspections = 0;

  completeOrdinaryField(id) { if (this.ordinaryAttempt != null) this.completedOrdinaryFields.add(id); }

  paramsForSelectedOption(option) {
    const selected = this.reviewedActionTargets == null || option == null ? undefined : new Set(option.field_ids ?? []);
    return { ...this.params, origin: this.currentOrigin,
      fields: this.params.fields.filter(field => (selected == null || selected.has(field.id)) && !this.completedOrdinaryFields.has(field.id)),
      options: selected == null || option == null ? this.params.options : [option] };
  }

  async revalidateOptionBindings(option) {
    const options = option == null ? this.params.options : [option];
    const statuses = await Promise.all((options ?? []).map(async current => {
      if (current.selector == null) return null;
      const binding = this.optionBindings.get(current.id);
      if (binding == null) return 'locator_invalid';
      let inspected;
      try { inspected = await selectorBinding(this.params.tab_id, current.selector, this.params.timeout_ms, this.ctx); }
      catch { return 'locator_invalid'; }
      return inspected.targetKey !== binding.targetKey ? 'page_changed' : inspected.origin !== binding.origin ? 'origin_changed'
        : sameDocument(binding, inspected) ? null : 'page_changed';
    }));
    return statuses.find(status => status != null) ?? null;
  }

  async revalidateBeforeAction(option, action) {
    const rejection = this.manualSavingRejection?.();
    if (rejection != null) return rejection;
    const selected = this.paramsForSelectedOption(option);
    const params = action == null ? selected : { ...selected,
      fields: 'type' in action ? [action] : [], submit: 'action' in action ? action : undefined };
    const page = await revalidatePage(selected.tab_id, this.currentOrigin, this.pageBinding, this.ctx);
    if (page != null) return page;
    if (!await validateLocators(params, this.ctx) || option?.selector != null
      && (this.reviewedActionTargets != null || (option.field_ids?.length ?? 0) === 0)
      && !await controlVisible(option.selector, selected, this.ctx)) return 'locator_invalid';
    return await this.revalidateOptionBindings(option)
      ?? (this.formBinding == null ? null : await revalidateForm(params, this.formBinding, this.ctx, this.params.fields[0]?.selector)
        ?? await this.revalidateCredentialSubmission());
  }

  async revalidateReviewedPresentation(option, promptOption = option) {
    const status = this.reviewedActionTargets == null ? await this.revalidateBeforeAction(option)
      : await this.revalidate(option, false, promptOption);
    return status === 'prompt_changed' ? 'page_changed' : status;
  }

  async revalidateBeforeSubmit(option) {
    const status = await this.revalidateBeforeAction(option, this.params.submit);
    if (status != null || this.reviewedActionTargets == null) return status;
    return await submissionOrigin(this.params, this.ctx, this.nativeDelivery || this.manualCredentialSave)
      === this.reviewedActionTargets.submissionOrigin ? null : 'origin_changed';
  }

  async revalidate(option, forReview = false, promptOption = option) {
    const rejection = this.manualSavingRejection?.();
    if (rejection != null) return rejection;
    const params = this.paramsForSelectedOption(option);
    let status = await revalidatePage(params.tab_id, this.currentOrigin, this.pageBinding, this.ctx);
    if (status != null) return status;
    const fields = await validatedFields(params, this.ctx, this.reviewedActionTargets != null, forReview);
    if (fields == null || !forReview && !await validateOptions(params, this.ctx)) return 'locator_invalid';
    status = await this.revalidateOptionBindings(option);
    if (status != null) return status;
    const plan = createBrowserAuthCredentialPlan(fields), targets = await actionTargets(params, this.ctx);
    if (targets == null) return 'locator_invalid';
    const reviewed = option == null ? this.reviewedActionTargets : { ...this.reviewedActionTargets,
      options: this.reviewedActionTargets?.options.filter(target => target.id === option.id) ?? [] };
    if (JSON.stringify(targets) !== JSON.stringify(reviewed)) return 'prompt_changed';
    if (this.formBinding != null) {
      status = await revalidateForm(params, this.formBinding, this.ctx, this.params.fields[0]?.selector);
      if (status != null) return status;
    }
    status = await revalidatePage(params.tab_id, this.currentOrigin, this.pageBinding, this.ctx)
      ?? await this.revalidateCredentialSubmission();
    if (status != null || this.ordinaryCredentialFields != null) return status;
    const promptFields = promptOption == null ? this.credentialPlan.promptFields
      : this.credentialPlan.promptFields.filter(field => (promptOption.field_ids ?? []).includes(field.id));
    const metadata = promptOption == null ? this.credentialPlan.credentialFieldMetadata
      : this.credentialPlan.credentialFieldMetadata.filter(field => (promptOption.field_ids ?? []).includes(field.id));
    return JSON.stringify(plan.promptFields) !== JSON.stringify(promptFields)
      || JSON.stringify(plan.credentialFieldMetadata) !== JSON.stringify(metadata) ? 'prompt_changed' : null;
  }

  async revalidateForReview() { return await this.revalidate(undefined, true); }

  async revalidateCredentialSubmission(ctx = this.ctx) {
    const rejection = this.manualSavingRejection?.();
    if (rejection != null) return rejection;
    if (this.credentialSubmissionFields != null) {
      const params = this.paramsForSelectedOption();
      if (!await validateLocators(params, this.ctx)) return 'page_changed';
      const current = await validatedFields(params, ctx, true, true);
      if (current == null || current.length !== params.fields.length) return 'page_changed';
      if (this.ordinaryCredentialFields != null) {
        const pair = credentialPair(this.credentialSubmissionFields.map(field => current.find(candidate => candidate.id === field.id) ?? field),
          this.ordinaryCredentialFields.username == null);
        if (pair?.username?.id !== this.ordinaryCredentialFields.username || pair?.password.id !== this.ordinaryCredentialFields.password) return 'page_changed';
      } else if (current.some((field, index) => field.required !== this.credentialSubmissionFields?.[index]?.required)) return 'page_changed';
    }
    if (!this.nativeDelivery && !this.manualCredentialSave) return null;
    return this.formBinding == null ? 'locator_invalid'
      : await submissionOrigin(this.params, ctx, true) === this.formBinding.origin ? null : 'origin_changed';
  }

  async reinspectOrdinary(status) {
    if (this.ordinaryAttempt == null || !['page_changed', 'origin_changed', 'locator_invalid', 'prompt_changed'].includes(status)) return false;
    while (this.ordinaryReinspections < 3) {
      const inspection = ++this.ordinaryReinspections;
      this.ordinaryAttempt.recordAttempt({ kind: 'reinspection_started', reinspection: inspection, outcome: status });
      let failed = 'locator_invalid';
      try {
        const page = await readBrowserAuthPageBinding(this.params.tab_id, undefined, this.ctx);
        if (typeof page === 'string') failed = page;
        else {
          if (page.frameId !== this.pageBinding.frameId) this.ordinaryAttempt.recordAttempt({ kind: 'frame_changed' });
          else if (page.loaderId !== this.pageBinding.loaderId) this.ordinaryAttempt.recordAttempt({ kind: 'document_changed' });
          else if (page.url !== this.pageBinding.url) this.ordinaryAttempt.recordAttempt({ kind: 'url_changed' });
          const origin = originOf(page.securityOrigin);
          if (origin == null || new URL(origin).protocol !== 'https:') failed = 'origin_changed';
          else {
            const params = { ...this.paramsForSelectedOption(), origin };
            const [fields, form, options, targets] = await Promise.all([
              validatedFields(params, this.ctx, true), formBinding(params, this.ctx), optionBindings(params, this.ctx),
              this.reviewedActionTargets == null ? undefined : actionTargets(params, this.ctx),
            ]);
            const submissionFields = this.credentialSubmissionFields?.map(field => fields?.find(candidate => candidate.id === field.id) ?? field);
            const pair = submissionFields == null ? undefined : credentialPair(submissionFields, this.ordinaryCredentialFields?.username == null);
            const after = await readBrowserAuthPageBinding(this.params.tab_id, origin, this.ctx);
            if (fields != null && form?.origin === origin && options != null
              && (this.reviewedActionTargets == null || targets != null)
              && pair?.username?.id === this.ordinaryCredentialFields?.username
              && pair?.password.id === this.ordinaryCredentialFields?.password
              && await validateOptions(params, this.ctx) && typeof after !== 'string' && sameDocument(page, after)) {
              Object.assign(this, { currentOrigin: origin, pageBinding: page, formBinding: form,
                optionBindings: options, reviewedActionTargets: targets ?? undefined, credentialSubmissionFields: submissionFields });
              this.ordinaryAttempt.refreshOrdinaryDocument(page.frameId, origin);
              this.ordinaryAttempt.recordAttempt({ kind: 'reinspection_succeeded', reinspection: inspection });
              return true;
            }
            if (typeof after === 'string') failed = after;
            else if (!sameDocument(page, after)) failed = 'page_changed';
          }
        }
      } catch { failed = 'locator_invalid'; }
      this.ordinaryAttempt.recordAttempt({ kind: 'reinspection_failed', reinspection: inspection, outcome: failed });
    }
    return false;
  }
}

function submissionFields(fields, requested) {
  if (!object(fields)) return null;
  const ids = new Set(requested.map(field => field.id)), result = Object.create(null);
  for (const [id, value] of Object.entries(fields)) {
    if (!ids.has(id) || typeof value !== 'string' || value.length > MAX_FIELD_LENGTH) return null;
    result[id] = value;
  }
  if (requested.some(field => field.required && !result[field.id])) return null;
  return result;
}

function selectedOption(id, options) { return options?.find(option => option.id === id); }

function validSelectedFields(fields, option, plan) {
  const selected = new Set(option.field_ids ?? []);
  return plan.promptFields.every(field => !(fields[field.id] != null && !selected.has(field.id))
    && !(selected.has(field.id) && field.required && !fields[field.id]));
}

async function pressLocator(params, ctx) {
  await required(ctx.browserAuth?.pressLocator, 'browserAuth.pressLocator')(params, ctx);
}

async function fillField(field, value, digitOtp, index, finalFill, checkpoint, option) {
  const { params, ctx } = checkpoint;
  const nativeSubmitSelector = checkpoint.nativeDelivery ? params.submit?.selector.split(FRAME_SEPARATOR).at(-1) : undefined;
  if (checkpoint.nativeDelivery && nativeSubmitSelector == null) return { status: 'locator_invalid', actionStarted: false };
  let status = null, actionStarted = false;
  try {
    await ctx.playwright.withBoundPlaywrightSelector(params.tab_id, field.selector,
      async () => (status = await checkpoint.revalidateBeforeAction(option, field)) == null,
      async bound => {
        const target = checkpoint.ordinaryAttempt != null && finalFill ? (await submissionTarget(params, ctx, true))?.url : undefined;
        actionStarted = true;
        checkpoint.ordinaryAttempt?.beginOrdinaryFill(index, finalFill, target);
        if (digitOtp) {
          await pressLocator({ browser_id: params.browser_id, tab_id: params.tab_id,
            selector: field.selector, value, timeout_ms: params.timeout_ms }, Object.create(ctx, { playwright: { value: bound } }));
          return;
        }
        await bound.evaluateOnPlaywrightSelectorWithTarget(params.tab_id, field.selector, fillBrowserAuthFieldInPage,
          { arg: { operation: 'browser-auth-fill', value, nativeSubmitSelector }, isolatedWorld: checkpoint.nativeDelivery, timeoutMs: params.timeout_ms });
      }, { isolatedWorld: checkpoint.nativeDelivery, timeoutMs: params.timeout_ms });
  } catch {
    return { status: await checkpoint.revalidateBeforeAction(option, field) ?? 'submission_failed', actionStarted };
  }
  return { status, actionStarted };
}

async function fillFields(fields, checkpoint, option) {
  const plan = checkpoint.credentialPlan;
  const count = plan.fillFields.reduce((total, item) => total + (fields[item.promptId] == null ? 0 : item.fields.length), 0);
  let index = 0;
  for (const item of plan.fillFields) {
    const supplied = fields[item.promptId];
    if (supplied == null) continue;
    const values = item.fields.length === 1 ? [supplied] : Array.from(supplied.trim().replace(/[\s-]+/g, ''));
    if (values.length !== item.fields.length) return 'submission_failed';
    const digitOtp = item.promptId === OTP_ID && values.every(value => /^[0-9]$/.test(value));
    for (const [offset, field] of item.fields.entries()) {
      for (;;) {
        const { status, actionStarted } = await fillField(field, values[offset] ?? '', digitOtp, index, index === count - 1, checkpoint, option);
        if (status == null) {
          checkpoint.completeOrdinaryField(field.id); checkpoint.ordinaryAttempt?.completeOrdinaryFill(index); break;
        }
        if (actionStarted) checkpoint.ordinaryAttempt?.recordAttempt({ kind: 'field_fill_uncertain', field_index: Math.min(index, 63) });
        if (await checkpoint.ordinaryAttempt?.verifiedOrdinarySiteSubmission(checkpoint.params.timeout_ms ?? 5000)) return 'submitted';
        if (actionStarted || !await checkpoint.reinspectOrdinary(status)) return status;
      }
      index++;
    }
  }
  return null;
}

async function waitForOtpSubmission(locator, origin, ctx, pressEnter) {
  const deadline = Date.now() + 1000;
  for (;;) {
    const page = await readBrowserAuthPageBinding(locator.tab_id, origin, ctx);
    if (typeof page === 'string') return page;
    let disappeared = false;
    try {
      disappeared = await ctx.playwright.evaluateOnPlaywrightSelectorAll(locator.tab_id, locator.selector, elements => elements.length) === 0;
      if (!disappeared && pressEnter) {
        const [visible, enabled] = await Promise.all([
          ctx.playwright.readElementState(locator, 'visible'), ctx.playwright.readElementState(locator, 'enabled'),
        ]);
        disappeared = !visible || !enabled;
      }
    } catch { disappeared = false; }
    if (disappeared) {
      const after = await readBrowserAuthPageBinding(locator.tab_id, origin, ctx);
      return typeof after === 'string' ? after : 'submitted';
    }
    if (Date.now() >= deadline) return null;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

export async function performBrowserAuthSubmission(fields, optionId, options, checkpoint, requestedFields) {
  const { credentialPlan: plan, params, ctx } = checkpoint;
  const values = submissionFields(fields, requestedFields);
  if (values == null) return 'submission_failed';
  const option = selectedOption(optionId, params.options), promptOption = selectedOption(optionId, options);
  if (options != null && (option == null || promptOption == null)
    || promptOption != null && !validSelectedFields(values, promptOption, plan)) return 'submission_failed';
  if (qrOnly(params)) return 'submitted';
  try {
    let status = await checkpoint.revalidateReviewedPresentation(option, promptOption);
    while (status != null && await checkpoint.reinspectOrdinary(status)) status = await checkpoint.revalidateReviewedPresentation(option, promptOption);
    if (status != null) return status;
    if (checkpoint.manualCredentialSave) {
      const submission = checkpoint.manualSubmission;
      if (submission == null || params.submit == null) return 'submission_failed';
      const username = params.fields.find(field => field.selector === submission.username.selector);
      const password = params.fields.find(field => field.selector === submission.password.selector);
      const usernameValue = username == null ? undefined : values[username.id], passwordValue = password == null ? undefined : values[password.id];
      if (usernameValue == null || passwordValue == null) return 'submission_failed';
      let result = null;
      await ctx.playwright.withBoundPlaywrightSelector(params.tab_id, submission.username.selector,
        async () => (result = await checkpoint.revalidateBeforeSubmit()) == null,
        async bound => {
          if (!await bound.evaluateOnPlaywrightSelector(params.tab_id, submission.username.selector, submitBrowserAuthFormInPage,
            { arg: { ...submission, values: { username: usernameValue, password: passwordValue } }, isolatedWorld: true, timeoutMs: params.timeout_ms })) result = 'submission_failed';
        }, { isolatedWorld: true, timeoutMs: params.timeout_ms });
      return result ?? 'submitted';
    }
    if (option?.selector != null && (option.field_ids?.length ?? 0) === 0) {
      let result = null;
      await ctx.playwright.withBoundPlaywrightSelector(params.tab_id, option.selector,
        async () => (result = await checkpoint.revalidateBeforeAction(option)) == null,
        async bound => { await bound.clickLocator({ browser_id: params.browser_id, tab_id: params.tab_id,
          selector: option.selector, timeout_ms: params.timeout_ms }, 1); }, { timeoutMs: params.timeout_ms });
      return result ?? 'submitted';
    }
    status = await fillFields(values, checkpoint, option);
    if (status != null) return status;
    const submit = params.submit;
    if (submit == null) return 'submitted';
    const locator = { browser_id: params.browser_id, tab_id: params.tab_id, selector: submit.selector, timeout_ms: params.timeout_ms };
    const first = plan.fillFields[0];
    if (first?.promptId === OTP_ID && first.fields.length > 1 && values[OTP_ID] != null) {
      status = await waitForOtpSubmission(locator, params.origin, ctx, submit.action === 'press_enter');
      if (status != null) return status;
    }
    for (;;) {
      if (await checkpoint.ordinaryAttempt?.verifiedOrdinarySiteSubmission(params.timeout_ms ?? 5000)) return 'submitted';
      let result = null, actionStarted = false;
      try {
        if (submit.action === 'click') await ctx.playwright.evaluateOnPlaywrightSelector(params.tab_id, submit.selector, (element, helper) => {
          if (!helper.elementState(element, 'enabled').matches) throw new Error('Browser auth submit control is not enabled');
          return true;
        }, { timeoutMs: params.timeout_ms });
        await ctx.playwright.withBoundPlaywrightSelector(params.tab_id, submit.selector,
          async () => (result = await checkpoint.revalidateBeforeSubmit(option)) == null,
          async bound => {
            const boundCtx = Object.create(ctx, { playwright: { value: bound } });
            result = await checkpoint.revalidateCredentialSubmission(boundCtx);
            if (result != null) return;
            actionStarted = true; checkpoint.ordinaryAttempt?.beginOrdinarySubmit();
            if (submit.action === 'click') await bound.clickLocator(locator, 1);
            else await pressLocator({ ...locator, value: 'Enter' }, boundCtx);
          }, { isolatedWorld: checkpoint.nativeDelivery || checkpoint.manualCredentialSave, timeoutMs: params.timeout_ms });
      } catch (error) {
        if (checkpoint.ordinaryAttempt == null || actionStarted) throw error;
        result = await checkpoint.revalidateBeforeSubmit(option) ?? 'submission_failed';
      }
      if (result == null || await checkpoint.ordinaryAttempt?.verifiedOrdinarySiteSubmission(params.timeout_ms ?? 5000)) return 'submitted';
      if (!await checkpoint.reinspectOrdinary(result)) return result;
    }
  } catch { return 'submission_failed'; }
}

async function screenshot(params, ctx) {
  try { return await required(ctx.browserAuth?.captureScreenshot, 'browserAuth.captureScreenshot')(params, ctx); }
  catch { return undefined; }
}

async function safetyReview({ params, ctx, checkpoint, targets, precheck, prompt, plan, credentialFrameId }) {
  const instructions = await required(ctx.browserAuth?.loadSafetyPrecheckInstructions, 'browserAuth.loadSafetyPrecheckInstructions')(ctx);
  if (typeof instructions !== 'string' || !instructions.trim()) throw new Error('Browser auth safety precheck instructions are empty.');
  let snapshot, captureError;
  const frames = new Set();
  try { snapshot = await required(ctx.browserAuth?.captureVisibleDom, 'browserAuth.captureVisibleDom')(params, ctx, credentialFrameId, frames);
    if (!frames.has(credentialFrameId)) throw new Error('The authentication frame was missing from the visible DOM');
  } catch (error) { captureError = error; snapshot = undefined; }
  if (typeof snapshot !== 'string' || !snapshot.trim()) {
    const status = await checkpoint.revalidateForReview();
    if (status != null) return { status };
    throw new Error('Browser auth could not capture the page content required for safety review.', { cause: captureError });
  }
  const before = await checkpoint.revalidateForReview();
  if (before != null) return { status: before };
  const review = precheck({ message: instructions.trim(), toolName: 'review_browser_auth_safety', toolParams: {
    proposed_user_prompt: prompt, visible_browser_state: {
      action_targets: { options: targets.options.map(({ id, accessible_name, origin }) => ({ id, accessible_name, origin })),
        ...targets.submit == null ? {} : { submit: { action: targets.submit.action, accessible_name: targets.submit.accessible_name } } },
      credential_field_metadata: plan.credentialFieldMetadata, credential_frame_origin: checkpoint.formBinding?.origin ?? prompt.origin,
      form_submission_origin: targets.submissionOrigin, top_level_origin: prompt.origin,
      visible_page_content: { format: 'dom_cua_visible_dom', snapshot },
    },
  } });
  const capture = (async () => {
    const [image, status] = await Promise.all([screenshot(params, ctx),
      (async () => !await validateLocators(params, ctx) || !await validateOptions(params, ctx) ? 'locator_invalid' : null)()]);
    return { image, status: status != null
      ? !await validateLocators(params, ctx) || !await validateOptions(params, ctx) ? 'locator_invalid' : null : null };
  })();
  const [reviewed, captured] = await Promise.allSettled([review, capture]);
  if (reviewed.status === 'rejected') throw reviewed.reason;
  if (captured.status === 'rejected') throw captured.reason;
  // sk/ni permit only an accepted decision from the actual automated reviewer.
  if (reviewed.value?.action !== 'accept'
    || !['guardian_subagent', 'auto_review'].includes(reviewed.value?._meta?.approvals_reviewer)) {
    throw new Error('Auto-review did not return a valid safety approval for this action.');
  }
  return { image: captured.value.image, status: captured.value.status ?? await checkpoint.revalidate() };
}

async function completeChallenge(challenge, status) {
  try { return await challenge.complete(status); } catch { return 'unavailable'; }
}

async function protectDelivery(ctx, tabId, manual = false) {
  const gate = ctx.credentialObservationGate;
  await required(manual ? gate?.protectManualSaving?.bind(gate) : gate?.protect?.bind(gate),
    manual ? 'credentialObservationGate.protectManualSaving' : 'credentialObservationGate.protect')(tabId,
    required(ctx.finishNativeCredentialModelCommand, 'finishNativeCredentialModelCommand'));
  required(ctx.cdp.protectBrowserAuthCredentialDiagnostics?.bind(ctx.cdp), 'cdp.protectBrowserAuthCredentialDiagnostics')(tabId);
}

export function createBrowserAuthController(context) {
  return Object.freeze({ handoff: params => handleBrowserAuthHandoff(params, context) });
}

export async function handleBrowserAuthHandoff(params, ctx) {
  if (ctx?.clientInfo?.capabilities?.tab?.some(capability => capability.id === 'browserAuth') !== true) return { status: 'unavailable' };
  if (!validRequest(params)) return { status: 'locator_invalid' };
  if (!hasCoreContext(ctx)) return { status: 'unavailable' };
  const page = await readBrowserAuthPageBinding(params.tab_id, params.origin, ctx);
  if (typeof page === 'string') return { status: page };
  const origin = originOf(page.securityOrigin);
  if (origin == null) return { status: 'origin_changed' };
  for (const field of params.fields) if (await userVisibility(field, params, ctx) === false) {
    return { status: 'locator_invalid', locator_error: { field_id: field.id, reason: 'not_user_visible' } };
  }
  let precheck;
  try { precheck = await ctx.browserAuth.getAutomatedSafetyPrecheck(ctx); }
  catch { return { status: 'unavailable' }; }
  if (precheck !== null && typeof precheck !== 'function') return { status: 'unavailable' };
  const isQrOnly = qrOnly(params);
  let fields, form, reviewed;
  if (isQrOnly) {
    fields = [];
    if (precheck != null) { reviewed = await actionTargets(params, ctx); if (reviewed == null) return { status: 'locator_invalid' }; }
  } else if (precheck == null) {
    fields = await validatedFields(params, ctx);
    if (fields == null || !await validateOptions(params, ctx)) return { status: 'locator_invalid' };
    form = await formBinding(params, ctx);
    if (form == null) return { status: 'locator_invalid' };
  } else {
    if (requestSelectors(params).some(selector => (selector.match(/internal:control\s*=\s*enter-frame/g)?.length ?? 0) > 1)) return { status: 'locator_invalid' };
    fields = await validatedFields(params, ctx, true, true);
    if (fields == null) return { status: 'locator_invalid' };
    [form, reviewed] = await Promise.all([formBinding(params, ctx), actionTargets(params, ctx)]);
    if (form == null || reviewed == null) return { status: 'locator_invalid' };
  }
  const bindings = await optionBindings(params, ctx);
  if (bindings == null || reviewed?.options.some(option => bindings.get(option.id)?.origin !== option.origin) === true) return { status: 'locator_invalid' };
  const crossOriginIframe = form == null || sameSite(page, form) ? undefined : { origin: form.origin };
  if (form != null && (crossOriginIframe != null && (!page.domainAndRegistry || !form.domainAndRegistry)
    || !await validateIntermediateFrames(page, form, params, ctx))) return { status: 'locator_invalid' };
  const pageStatus = await revalidatePage(params.tab_id, params.origin, page, ctx);
  if (pageStatus != null) return { status: pageStatus };
  const plan = createBrowserAuthCredentialPlan(fields);
  const emailOtpSessionId = params.otpHandle == null ? undefined : sessionId(ctx.runtime);
  if (params.otpHandle != null && (emailOtpSessionId == null || ctx.credentialObservationGate == null
    || params.options != null || params.qr_code === true || form?.origin !== origin || !origin.startsWith('https://')
    || plan.promptFields.length !== 1 || !plan.promptFields[0]?.required || fields.some(field => field.type === 'password'))) return { status: 'unavailable' };
  const options = promptOptions(params.options, plan);
  if (options === null) return { status: 'locator_invalid' };
  const checkpoint = new BrowserAuthCheckpoint(params, ctx, page, form, bindings, plan, reviewed);
  const displayName = ctx.elicitationDisplayName ?? 'Browser use';
  const prompt = { connector_id: 'browser-use', connector_name: displayName,
    ...crossOriginIframe == null ? {} : { cross_origin_iframe: crossOriginIframe },
    fields: plan.promptFields.map(field => ({ ...field, label_metadata: {
      accessible_name: field.label_metadata.accessible_name, autocomplete: field.label_metadata.autocomplete,
      input_type: field.label_metadata.input_type, input_name: field.label_metadata.input_name,
    } })), frame_origin: form?.origin ?? origin, origin, ...params.qr_code === true ? { qr_code: true } : {},
    reason: AUTH_MESSAGE, ...options == null ? {} : { options: options.map(({ id, label, field_ids }) => ({ id, label, field_ids: field_ids ?? [] })) } };
  const createElicitation = precheck == null ? ctx.runtime.createElicitation
    : ctx.browserAuth.secureCreateElicitation ?? ctx.runtime.createElicitation;
  if (typeof createElicitation !== 'function') return { status: 'unavailable' };
  const elicit = ctx.commandTiming.trackElicitation(createElicitation);
  if (typeof elicit !== 'function') return { status: 'unavailable' };
  let image;
  if (precheck != null) {
    try {
      const { frame_origin, ...reviewPrompt } = prompt;
      const review = await safetyReview({ params, ctx, checkpoint, targets: reviewed, precheck,
        credentialFrameId: form?.frameId ?? page.frameId, plan,
        prompt: { message: AUTH_MESSAGE, ...reviewPrompt, fields: reviewPrompt.fields.map(({ id, label, type, autocomplete, required: fieldRequired }) => ({
          id, label, type, autocomplete, required: fieldRequired,
        })) } });
      if (review.status != null) return { status: review.status === 'prompt_changed' ? 'page_changed' : review.status };
      image = review.image;
    } catch { return { status: 'unavailable' }; }
  } else image = await screenshot(params, ctx);
  let qr;
  if (params.qr_code === true) {
    if (image == null || typeof ctx.browserAuth.decodeQrCode !== 'function'
      || typeof ctx.browserAuth.startQrCodeWatch !== 'function') return { status: 'unavailable' };
    try { qr = await ctx.browserAuth.decodeQrCode(image.url, params, ctx); } catch { return { status: 'unavailable' }; }
    if (qr == null || typeof qr.payload !== 'string' || !qr.payload) return { status: 'unavailable' };
  }
  let qrUrl;
  if (qr != null && URL.canParse(qr.payload)) {
    const url = new URL(qr.payload);
    if (url.protocol === 'https:' && url.hostname.length > 0 && url.username.length === 0 && url.password.length === 0) qrUrl = qr.payload;
  }
  const optionFieldIds = new Set((options ?? []).flatMap(option => option.field_ids ?? []));
  const requestedFields = plan.promptFields.filter(field => options == null || optionFieldIds.has(field.id))
    .map(({ id, required: fieldRequired }) => ({ id, required: options == null ? fieldRequired : false }));
  const bindingVersion = ctx.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_BINDING_VERSION;
  let credentialBinding = ['1', '2'].includes(bindingVersion) ? await nativeBinding(params, fields, origin, form?.origin, ctx) : undefined;
  const manualBinding = Object.hasOwn(ctx.runtime.env, 'BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION')
    && ['8', '10'].includes(ctx.runtime.env.BROWSER_AUTH_BROKER_MANUAL_SAVE_BINDING_VERSION ?? '')
    ? await manualSaveBinding(params, fields, requestedFields, origin, form?.origin, ctx) : undefined;
  if (bindingVersion === '2' && manualBinding?.kind === 'ordinary' && form != null
    && credentialOptionAllowed(params.options, fields, manualBinding.fields.username, manualBinding.fields.password,
      ctx.runtime.env.BROWSER_AUTH_BROKER_CREDENTIAL_OPTIONS_VERSION)) {
    credentialBinding = { fields: manualBinding.fields.username == null
      ? [{ id: manualBinding.fields.password, kind: 'password' }]
      : [{ id: manualBinding.fields.username, kind: 'username' }, { id: manualBinding.fields.password, kind: 'password' }],
    session_id: manualBinding.sessionId, submission_origin: form.origin, submission: 'ordinary' };
  }
  let challenge;
  try {
    challenge = await BrowserAuthBrokerChallenge.create(ctx.createBrowserAuthBrokerTransport, requestedFields,
      options?.map(({ id, field_ids }) => ({ id, field_ids: field_ids ?? [] })), {
        qrCode: params.qr_code === true, origins: { origin: prompt.origin, frame_origin: prompt.frame_origin },
        manualSaveFields: manualBinding?.fields, manualSaveSessionId: manualBinding?.sessionId,
        credentialBinding, emailOtpSessionId,
      });
  } catch { return { status: 'unavailable' }; }
  let watcher;
  if (qr != null) {
    try {
      watcher = ctx.browserAuth.startQrCodeWatch({ ctx, initialQrCode: qr, params,
        pageBindingStatus: () => checkpoint.revalidateBeforeAction(), completeWhenQrCodeDisappears: isQrOnly,
        publishPayload: (payload, disappeared) => challenge.publishQrCodePayload(payload, disappeared) });
      if (typeof watcher?.stop !== 'function') throw new Error('Browser auth QR code watch is unavailable');
    } catch { const status = await completeChallenge(challenge, 'unavailable'); challenge.close(); return { status }; }
  }
  let resultStatus = null, selected, diagnostics;
  const delivery = (async () => {
    let guard;
    try {
      const submission = await challenge.waitForSubmission();
      if ('status' in submission) return resultStatus = submission.status;
      if (submission.email_otp_delivery === true) {
        if (emailOtpSessionId == null) throw new Error('Email OTP delivery is unavailable');
        await protectDelivery(ctx, Number(params.tab_id));
      }
      checkpoint.nativeDelivery = submission.native_credential_delivery === true;
      const ordinary = submission.ordinary_credential_delivery === true, manual = submission.manual_credential_save === true;
      if (manual && (manualBinding == null || form == null)) throw new Error('Manual credential saving is unavailable');
      if (ordinary && (manual || checkpoint.nativeDelivery || credentialBinding?.submission !== 'ordinary'
        || manualBinding?.kind !== 'ordinary') || checkpoint.nativeDelivery && credentialBinding?.submission === 'ordinary') throw new Error('Credential delivery mode is unavailable');
      const protectedSubmission = manual || ordinary, privateBinding = manualBinding?.kind === 'private' ? manualBinding : undefined;
      checkpoint.manualCredentialSave = manual && privateBinding != null;
      if (checkpoint.nativeDelivery || protectedSubmission && manualBinding?.kind === 'ordinary') checkpoint.credentialSubmissionFields = fields;
      if (protectedSubmission && (manualBinding == null || form == null || ctx.credentialObservationGate == null)) throw new Error('Credential submission protection is unavailable');
      const tabId = Number(params.tab_id);
      let ordinaryEpoch;
      if (protectedSubmission) {
        checkpoint.manualSubmission = privateBinding?.submission;
        await protectDelivery(ctx, tabId, true);
        if (manualBinding?.kind === 'ordinary') {
          ordinaryEpoch = ctx.credentialObservationGate.epoch; checkpoint.ordinaryCredentialFields = manualBinding.fields;
        }
        guard = await createBrowserAuthSubmissionGuard({ cdp: ctx.cdp, requests: ctx.documentResponses, tabId,
          frameId: privateBinding == null ? page.frameId : form.frameId,
          ...privateBinding == null ? { ordinary: { origin: form.origin, password: submission.fields[manualBinding.fields.password] } }
            : { target: privateBinding.target, credentialFields: [
              { name: privateBinding.names.username, value: submission.fields[privateBinding.fields.username] },
              { name: privateBinding.names.password, value: submission.fields[privateBinding.fields.password] },
            ] },
        });
        checkpoint.manualSavingRejection = guard.currentRejection.bind(guard);
        if (ordinaryEpoch != null) { checkpoint.ordinaryAttempt = guard; guard.recordAttempt({ kind: 'prompt_completed' }); }
      }
      if (!protectedSubmission && !checkpoint.nativeDelivery) await closeBrowserAuthSubmissionGuard(ctx.documentResponses, tabId);
      if (checkpoint.nativeDelivery) {
        if (credentialBinding == null) throw new Error('Native credential observation protection is unavailable');
        await protectDelivery(ctx, tabId);
      }
      const action = performBrowserAuthSubmission(submission.fields, submission.selected_option, options, checkpoint, requestedFields);
      let status;
      try {
        status = guard == null || privateBinding == null ? await action : await Promise.race([action, guard.whenRejected()]);
        if (status === 'submitted' && guard != null) status = privateBinding == null ? await guard.ordinaryResult() : await guard.result(params.timeout_ms ?? 5000);
      } finally {
        if (ordinaryEpoch != null) await Promise.allSettled([action]);
        if (privateBinding == null) await guard?.waitForOrdinaryDocumentCleanup();
        if (ordinaryEpoch != null) {
          ctx.credentialObservationGate.allowOrdinaryInteraction(tabId, ordinaryEpoch); guard?.settleOrdinarySubmission();
        }
        diagnostics = guard?.diagnostics();
      }
      if (status === 'submitted' && options != null) selected = submission.selected_option;
      resultStatus = status;
      return await challenge.complete(status, plan.promptFields.some(field => field.type === 'password'
        && ![field.autocomplete, field.label_metadata.autocomplete].some(value => value?.toLowerCase().split(/\s+/).includes('one-time-code'))
        && Object.hasOwn(submission.fields, field.id)));
    } catch {
      diagnostics = guard?.diagnostics(); resultStatus ??= 'unavailable';
      return await completeChallenge(challenge, resultStatus);
    } finally {
      if (checkpoint.ordinaryAttempt != null) {
        checkpoint.ordinaryAttempt.completeOrdinaryAttempt(['submitted', 'origin_changed', 'page_changed', 'locator_invalid', 'submission_failed'].includes(resultStatus)
          ? resultStatus : 'unavailable');
        diagnostics = checkpoint.ordinaryAttempt.diagnostics();
      }
    }
  })();
  let elicitation;
  try {
    if (params.otpHandle != null) {
      let otpResult;
      try {
        otpResult = await elicit({ message: `Allow ChatGPT to fill this verification code? A verification code from your connected email will be sent privately to ${origin}. ChatGPT cannot see the code. You can also enter it yourself.`,
          requestedSchema: { type: 'object', properties: { approved: { type: 'boolean' } }, required: ['approved'], additionalProperties: true },
          meta: { codex_approval_kind: 'browser_email_otp', codex_requires_user_input: true, codex_guardian_compatible: false,
            connector_id: 'browser-use', connector_name: displayName, browser_auth_challenge_id: challenge.id,
            otp_handle: params.otpHandle, origin, frame_origin: origin } });
      } catch {}
      if (challenge.hasSubmission) return { status: await delivery };
      const content = object(otpResult?.content) ? otpResult.content : undefined;
      if (otpResult?.action !== 'decline' && !(otpResult?.action === 'accept' && content?.approved === true
        && content.email_otp_status === 'unavailable' && content.retire_challenge === undefined)) {
        const status = await completeChallenge(challenge, otpResult?.action === 'cancel' ? 'cancelled' : 'unavailable');
        await delivery; return { status };
      }
    }
    elicitation = await elicit({ message: AUTH_MESSAGE, requestedSchema: { type: 'object', properties: {}, additionalProperties: false },
      meta: { codex_approval_kind: 'browser_auth', codex_requires_user_input: true, codex_guardian_compatible: false,
        browser_auth_challenge_id: challenge.id, ...prompt,
        ...qr == null ? {} : { qr_code_payload: qr.payload, qr_code_only: isQrOnly },
        ...qrUrl == null ? {} : { qr_code_url: qrUrl }, ...image == null ? {} : { screenshot: image } } });
    if (resultStatus == null && challenge.hasSubmission) resultStatus = await delivery;
    else if (resultStatus == null) resultStatus = await completeChallenge(challenge,
      elicitation?.action === 'decline' ? 'declined' : elicitation?.action === 'cancel' ? 'cancelled' : 'unavailable');
    await delivery;
  } catch (error) {
    resultStatus = await completeChallenge(challenge, 'unavailable'); await delivery;
    if (error?.message === UNSUPPORTED_ELICITATION) return { status: 'unavailable' };
    throw error;
  } finally { watcher?.stop(); challenge.close(); }
  if (elicitation?.action === 'decline' && resultStatus === 'declined') {
    if (elicitation._meta?.['openai/client_unsupported'] === true) throw new Error('This ChatGPT client does not support secure browser authentication. Tell the user to update the ChatGPT app to the latest version before trying again.');
    if (elicitation._meta?.['openai/client_is_mobile'] === true && isQrOnly) throw qrUrl != null
      ? new Error(`This ChatGPT mobile client requires a QR-code sign-in link. Show the user this secure HTTPS sign-in URL exactly: ${new URL(qrUrl).href}\nAsk the user to open the link, complete sign-in, and report back when done. Do not say that the user declined or dismissed the request.`)
      : new Error('This QR-code sign-in flow probably cannot be completed on a mobile device. Explain that the website requires a QR code the mobile app cannot use.');
    if (elicitation._meta?.['openai/user_took_over'] === true) return { status: 'declined', reason: 'user_took_over' };
  }
  return { status: TERMINAL_STATUSES.has(resultStatus) ? resultStatus : 'unavailable',
    ...selected == null ? {} : { selected_option: selected },
    submission_diagnostics: resultStatus === 'submitted' ? undefined : diagnostics };
}
