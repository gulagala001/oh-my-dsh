const usernameTypes = new Set(['text', 'email', 'tel', 'number', 'search', 'url']);
const tokens = value => typeof value === 'string' ? value.toLowerCase().split(/\s+/) : [];
const excluded = field => {
  const autocomplete = tokens(field.autocomplete), label = field.label?.replace(/[\p{Dash}_\s]+/gu, ' ') ?? '';
  return autocomplete.includes('one-time-code') || autocomplete.includes('new-password')
    || /\b(?:[ht]?otp|one ?time(?: ?(?:password|passcode|code))?|verification code|security code|authentication code|2fa|mfa)\b/i.test(label);
};

// Only authenticated sB metadata, collected from the bound document, is accepted.
export function localCredentialPlan(prompt, metadata, binding, { passwordOnly = false } = {}) {
  if (!prompt.origin.startsWith('https://') || prompt.qr?.only || prompt.origin !== prompt.frameOrigin || binding.origin !== prompt.origin
    || binding.frameOrigin !== prompt.frameOrigin || !Array.isArray(metadata.fields)) return null;
  const fields = prompt.fields.map(field => {
    const source = metadata.fields.find(value => value.id === field.id), info = source?.label_metadata;
    if (!info || info.input_type !== field.type || info.autocomplete != null
      && (typeof info.autocomplete !== 'string' || info.autocomplete.length > 256)
      || info.input_name != null && (typeof info.input_name !== 'string' || info.input_name.length > 2048)
      || info.accessible_name != null && (typeof info.accessible_name !== 'string' || info.accessible_name.length > 2048)) return null;
    return { ...field, autocomplete: info.autocomplete ?? '', label: info.accessible_name ?? field.label,
      inputName: info.input_name ?? '' };
  });
  if (fields.some(field => !field)) return null;
  const candidates = fields.filter(field => !excluded(field));
  const passwords = candidates.filter(field => field.type === 'password');
  const usernames = candidates.filter(field => {
    if (!usernameTypes.has(field.type)) return false;
    if (tokens(field.autocomplete).includes('username')) return true;
    const label = field.label?.replace(/[\p{Dash}_\s]+/gu, ' ').trim() ?? '';
    if (/^(?:code|passcode|pin|token)[:*]?$/i.test(label)) return false;
    return field.type !== 'number'
      || /\b(?:user ?name|(?:user|login|account|customer|member|membership|rapid rewards) (?:id|number|no\.?))\b|^(?:account|login|user|member)[:*]?$/i.test(label);
  });
  const explicit = usernames.filter(field => tokens(field.autocomplete).includes('username'));
  const selected = explicit.length ? explicit : usernames;
  if (passwords.length !== 1 || selected.length !== 1 && !(passwordOnly && selected.length === 0
    && fields.length === 1 && !prompt.options)) return null;
  const username = selected[0], password = passwords[0];
  const options = prompt.options?.filter(option => (!username || option.fieldIds.includes(username.id))
    && option.fieldIds.includes(password.id));
  if (options && options.length !== 1) return null;
  const option = options?.[0], active = fields.filter(field => !option || option.fieldIds.includes(field.id));
  if (active.some(field => field.required && field.id !== username?.id && field.id !== password.id)) return null;
  let page;
  try { const url = new URL(binding.url); if (url.origin !== prompt.origin) return null; page = url.origin + url.pathname; }
  catch { return null; }
  const describe = field => ({ id: field.id, type: field.type, autocomplete: field.autocomplete,
    inputName: field.inputName, label: field.label });
  return { usernameId: username?.id, passwordId: password.id, optionId: option?.id, passwordOnly: !username,
    scope: { frameOrigin: prompt.frameOrigin, fieldBinding: JSON.stringify({ page,
      username: username ? describe(username) : null, password: describe(password), optionId: option?.id ?? null }) } };
}

export function matchesCredentialRegistration(plan, registration) {
  if (!plan) return false;
  const manual = registration.manualSaveFields, native = registration.credentialBinding;
  if (manual && (manual.password !== plan.passwordId || manual.username !== plan.usernameId)) return false;
  if (native) {
    const expected = [...(plan.usernameId ? [{ id: plan.usernameId, kind: 'username' }] : []),
      { id: plan.passwordId, kind: 'password' }];
    if (native.fields.length !== expected.length || native.fields.some((field, index) => field.id !== expected[index].id
      || field.kind !== expected[index].kind)) return false;
  }
  return true;
}

export function wipeCredential(record) {
  if (!record || typeof record !== 'object') return;
  for (const key of ['username', 'password']) { record[key] = ''; delete record[key]; }
}

export function localCredentialMetadata(records) {
  if (!Array.isArray(records)) return [];
  return records.filter(record => typeof record?.id === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(record.id)
    && typeof record.username === 'string' && record.username.length <= 16384).slice(0, 32)
    .map(record => ({ id: record.id, accountLabel: record.username, providerName: 'OpenCU Passwords',
      reference: record.id.slice(-6) }));
}
