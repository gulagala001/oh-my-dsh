/** Fixed DOM operations, serialized into the selected main document by each backend. */
export function runDOMLocator(request = {}) {
  const fail = (code, message) => { throw Object.assign(new Error(message), {code, details:{inputDispatched:false}}); };
  const unsupported = message => fail('UNSUPPORTED_LOCATOR', message);
  const normalize = text => String(text ?? '').replace(/\s+/gu, ' ').trim();
  const string = (value, name) => { if (typeof value !== 'string') unsupported(`${name} requires a string`); return value; };
  const regexes = new Map();
  const matcher = (value, name) => {
    if (typeof value === 'string') return value;
    if (!value || value.type !== 'regex' || typeof value.source !== 'string' || typeof value.flags !== 'string' || Object.keys(value).some(key => !['type','source','flags'].includes(key))) unsupported(`${name} requires a string or serialized RegExp`);
    const key = JSON.stringify(value);
    if (!regexes.has(key)) { try { regexes.set(key, new RegExp(value.source, value.flags)); } catch (error) { unsupported(`Invalid RegExp: ${error.message}`); } }
    return regexes.get(key);
  };
  const matches = (actual, expected, exact = false) => {
    const pattern = matcher(expected, 'text matcher');
    if (pattern instanceof RegExp) { pattern.lastIndex = 0; return pattern.test(String(actual ?? '')); }
    return exact ? normalize(actual) === normalize(pattern) : normalize(actual).toLowerCase().includes(normalize(pattern).toLowerCase());
  };
  const parent = element => element.parentElement ?? element.getRootNode()?.host;
  const hidden = element => {
    for (let current = element; current?.nodeType === 1; current = parent(current)) {
      const style = getComputedStyle(current);
      if (current.hidden || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return true;
    }
    return false;
  };
  const visible = element => !hidden(element) && [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
  const disabled = element => {
    if (element.matches(':disabled')) return true;
    for (let current = element; current?.nodeType === 1; current = parent(current)) if (current.getAttribute('aria-disabled') === 'true' || current.inert) return true;
    return false;
  };
  const text = element => element.matches('input[type=button],input[type=submit],input[type=reset]') ? element.value : element.textContent ?? '';
  const nameText = (node, includeHidden = false, excluded) => {
    if (node === excluded) return ' ';
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    if (node.matches('script,style,template,noscript') || !includeHidden && (node.getAttribute('aria-hidden') === 'true' || hidden(node))) return '';
    if (node.hasAttribute('aria-label')) return node.getAttribute('aria-label');
    if (node.matches('img,input[type=image]')) return node.getAttribute('alt') ?? '';
    if (node.matches('input[type=button],input[type=submit],input[type=reset]')) return node.value;
    const assigned = node.tagName === 'SLOT' ? node.assignedNodes({flatten:true}) : [];
    const children = assigned.length ? assigned : (node.shadowRoot ?? node).childNodes;
    return [...children].map(child => nameText(child, includeHidden, excluded)).join('');
  };
  const label = element => {
    const references = element.getAttribute('aria-labelledby');
    if (references) return normalize(references.split(/\s+/u).map(id => { const node = element.getRootNode().getElementById?.(id); return node ? nameText(node, true) : ''; }).join(' '));
    return element.getAttribute('aria-label') ?? (element.labels ? [...element.labels].map(item => nameText(item, false, element)).join(' ') : '');
  };
  const name = element => label(element) || element.getAttribute('alt') || (element.matches('input[type=button],input[type=submit],input[type=reset]') ? element.value : '') || (element.matches('input,textarea,select') ? element.getAttribute('title') || '' : nameText(element)) || element.getAttribute('title') || '';
  const role = element => {
    const explicit = element.getAttribute('role')?.trim().split(/\s+/u)[0];
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area') return element.hasAttribute('href') ? 'link' : '';
    if (tag === 'input') return ({ button: 'button', submit: 'button', reset: 'button', image: 'button', checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox', hidden: '', password: '' })[element.type] ?? (element.hasAttribute('list') ? 'combobox' : 'textbox');
    if (tag === 'select') return element.multiple || element.size > 1 ? 'listbox' : 'combobox';
    if (/^h[1-6]$/u.test(tag)) return 'heading';
    if (tag === 'th') return element.getAttribute('scope') === 'row' ? 'rowheader' : 'columnheader';
    if (tag === 'img') return element.getAttribute('alt') === '' ? '' : 'img';
    if (tag === 'form' || tag === 'section') return label(element) ? tag === 'form' ? 'form' : 'region' : '';
    return ({button:'button',textarea:'textbox',option:'option',optgroup:'group',ul:'list',ol:'list',li:'listitem',table:'table',tr:'row',td:'cell',thead:'rowgroup',tbody:'rowgroup',tfoot:'rowgroup',dialog:'dialog',progress:'progressbar',meter:'meter',nav:'navigation',main:'main',aside:'complementary',article:'article',summary:'button',fieldset:'group',output:'status',hr:'separator'})[tag] ?? '';
  };
  const descendants = root => {
    const elements = [...root.querySelectorAll('*')], result = [];
    for (const element of elements) { result.push(element); if (element.shadowRoot) result.push(...descendants(element.shadowRoot)); }
    return result;
  };
  const options = request.args ?? {};
  if (!options || typeof options !== 'object' || Array.isArray(options)) unsupported('Locator args must be an object');
  if (request.operation === 'domSnapshot') {
    const maxNodes = options.maxNodes ?? 500, maxChars = options.maxChars ?? 60000;
    if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 5000 || !Number.isInteger(maxChars) || maxChars < 100 || maxChars > 200000) unsupported('domSnapshot maxNodes must be 1–5000 and maxChars 100–200000');
    const lines = [`Document ${JSON.stringify(document.title)} ${location.href}`];
    let characters = lines[0].length, count = 0, truncated = false;
    for (const element of descendants(document)) {
      if (element.closest('script,style,template,noscript') || !visible(element)) continue;
      const semanticRole = role(element), leafText = !element.children.length ? normalize(text(element)) : '';
      if (!semanticRole && !leafText && !element.isContentEditable && !element.matches('input,iframe')) continue;
      let depth = 0; for (let ancestor = parent(element); ancestor && depth < 12; ancestor = parent(ancestor)) depth++;
      const states = [];
      if (disabled(element)) states.push('disabled');
      for (const state of ['checked','selected','expanded','pressed','required','invalid','readonly']) {
        const attribute = element.getAttribute(`aria-${state}`);
        if (attribute !== null) states.push(`${state}=${attribute}`);
        else if (typeof element[state === 'readonly' ? 'readOnly' : state] === 'boolean' && element[state === 'readonly' ? 'readOnly' : state]) states.push(state);
      }
      if (element.matches('input,textarea,select') && element.type !== 'password') states.push(`value=${JSON.stringify(String(element.value ?? '').slice(0,1000))}`);
      if (element.type === 'password') states.push('value=[redacted]');
      if (element.tagName === 'A' && element.hasAttribute('href')) states.push(`href=${JSON.stringify(element.getAttribute('href'))}`);
      if (element.tagName === 'IFRAME') states.push('frame contents omitted; use frameLocator(css).domSnapshot() to inspect');
      const line = `${'  '.repeat(Math.max(0,depth - 1))}${semanticRole || element.tagName.toLowerCase()} ${JSON.stringify(normalize(name(element) || leafText).slice(0,1000))}${states.length ? ` [${states.join(', ')}]` : ''}`;
      if (count >= maxNodes || characters + line.length + 1 > maxChars) { truncated = true; break; }
      lines.push(line); count++; characters += line.length + 1;
    }
    if (truncated) lines.push(`[truncated: maxNodes=${maxNodes}, maxChars=${maxChars}]`);
    return lines.join('\n');
  }
  if (!Array.isArray(request.locator) || request.locator.length > 100) unsupported('locator must be an array with at most 100 steps');
  let current = [document];
  for (const step of request.locator) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) unsupported('Invalid locator step');
    const permitted = {role:['kind','value','name','exact'],text:['kind','value','exact'],label:['kind','value','exact'],placeholder:['kind','value','exact'],testId:['kind','value'],css:['kind','value'],nth:['kind','index'],filter:['kind','hasText','hasNotText','visible']}[step.kind];
    if (!permitted || Object.keys(step).some(key => !permitted.includes(key))) unsupported(`Unsupported locator step or option: ${step.kind}`);
    if (step.exact !== undefined && typeof step.exact !== 'boolean') unsupported('exact must be a boolean');
    if (step.kind === 'nth') {
      if (!Number.isInteger(step.index)) unsupported('nth requires an integer index');
      const index = step.index < 0 ? current.length + step.index : step.index;
      current = current[index] ? [current[index]] : []; continue;
    }
    if (step.kind === 'filter') {
      if (step.hasText !== undefined) matcher(step.hasText, 'hasText');
      if (step.hasNotText !== undefined) matcher(step.hasNotText, 'hasNotText');
      if (step.visible !== undefined && typeof step.visible !== 'boolean') unsupported('visible must be a boolean');
      current = current.filter(element => element.nodeType === 1 && (step.hasText === undefined || matches(text(element), step.hasText)) && (step.hasNotText === undefined || !matches(text(element), step.hasNotText)) && (step.visible === undefined || visible(element) === step.visible)); continue;
    }
    const value = ['role','css'].includes(step.kind) ? string(step.value, step.kind) : (matcher(step.value, step.kind), step.value);
    if (step.name !== undefined) matcher(step.name, 'role name');
    const found = [];
    for (const root of current) {
      const candidates = descendants(root);
      let cssMatches;
      if (step.kind === 'css') {
        if (/>>|:has-text\(|:text(?:-is|-matches)?\(|:visible\b/u.test(value)) unsupported('Use standard CSS selectors; Playwright selector extensions and frame selectors are unsupported');
        try { cssMatches = new Set([root, ...candidates.filter(element => element.shadowRoot).map(element => element.shadowRoot)].flatMap(scope => [...scope.querySelectorAll(value)])); } catch { unsupported('Invalid or unsupported CSS selector'); }
      }
      for (const element of candidates) {
        let matched = false;
        if (step.kind === 'css') matched = cssMatches.has(element);
        else if (step.kind === 'role') matched = role(element) === value && !hidden(element) && !element.closest('[aria-hidden="true"]') && (step.name === undefined || matches(name(element), step.name, step.exact));
        else if (step.kind === 'text') matched = !element.matches('script,style,noscript') && matches(text(element), value, step.exact) && ![...element.children].some(child => matches(text(child), value, step.exact));
        else if (step.kind === 'label') matched = !!label(element) && matches(label(element), value, step.exact);
        else if (step.kind === 'placeholder') matched = element.hasAttribute('placeholder') && matches(element.getAttribute('placeholder'), value, step.exact);
        else if (step.kind === 'testId') matched = element.hasAttribute('data-testid') && matches(element.getAttribute('data-testid'), value, true);
        if (matched) found.push(element);
      }
    }
    current = [...new Set(found)];
  }
  const method = request.method;
  if (!['count','innerText','textContent','allTextContents','isVisible','isEnabled','getAttribute','click','dblclick','fill','press','check','uncheck','setChecked','selectOption','waitFor','resolveFrame'].includes(method)) unsupported(`Unsupported locator method: ${method}`);
  const supportedArgs = {waitFor:['state'],getAttribute:['name'],click:['button'],dblclick:['button'],fill:['value'],press:['key'],setChecked:['checked'],selectOption:['value']}[method] ?? [];
  if (Object.keys(options).some(key => !supportedArgs.includes(key))) unsupported(`Unsupported ${method} option; supported options: ${supportedArgs.join(', ') || 'none'}`);
  if (options.button !== undefined && !['left','middle','right'].includes(options.button)) unsupported('click button must be left, middle, or right');
  if (method === 'waitFor') {
    const state = options.state ?? 'visible';
    if (!['attached','detached','visible','hidden'].includes(state)) unsupported('waitFor state must be attached, detached, visible, or hidden');
    if (current.length > 1) fail('AMBIGUOUS_LOCATOR', `Locator matched ${current.length} elements`);
    if (!current.length) return state === 'hidden' || state === 'detached';
    if (state === 'attached') return true;
    if (state === 'detached') return false;
    return state === 'visible' ? visible(current[0]) : !visible(current[0]);
  }
  if (method === 'count') return current.length;
  if (method === 'allTextContents') return current.map(element => element.nodeType === 9 ? element.documentElement?.textContent ?? '' : element.textContent ?? '');
  if (!current.length) { if (method === 'isVisible') return false; fail('LOCATOR_NOT_FOUND', 'Locator matched no elements in the selected main document'); }
  if (current.length !== 1) fail('AMBIGUOUS_LOCATOR', `Locator matched ${current.length} elements; narrow it or use nth()`);
  const element = current[0];
  if (method === 'resolveFrame') { if (!element.matches?.('iframe,frame')) unsupported('frameLocator must resolve to an iframe or frame'); return element; }
  if (element.nodeType !== 1 && !['innerText','textContent'].includes(method)) unsupported('Add a locator step to select a DOM element');
  if (method === 'innerText') {
    if (element.nodeType === 9) return element.body?.innerText ?? '';
    if (typeof element.innerText !== 'string') unsupported('innerText requires an HTML element');
    return element.innerText;
  }
  if (method === 'textContent') return element.nodeType === 9 ? element.documentElement?.textContent ?? '' : element.textContent;
  if (method === 'isVisible') return visible(element);
  if (method === 'isEnabled') return !disabled(element);
  if (method === 'getAttribute') return element.getAttribute(string(options.name, 'getAttribute name'));
  if (element.isConnected === false) fail('STALE_ELEMENT', 'Locator element was detached');
  if (!visible(element)) fail('LOCATOR_NOT_ACTIONABLE', 'Locator element is hidden or has no visible box');
  if (disabled(element)) fail('LOCATOR_NOT_ACTIONABLE', 'Locator element is disabled');
  if (method === 'fill') {
    if (typeof options.value !== 'string' || !(element.matches('textarea') || element.tagName === 'INPUT' && ['text','email','password','search','tel','url','number'].includes(element.type) || element.isContentEditable)) unsupported('fill requires a string value and an editable text or number element');
    if (element.tagName === 'INPUT' && element.type === 'number' && options.value !== '') {
      const probe = element.cloneNode(); probe.value = options.value;
      if (!probe.value || !Number.isFinite(probe.valueAsNumber)) unsupported('fill requires a valid finite number for a number input');
    }
  }
  if (method === 'press' && !string(options.key, 'press key')) unsupported('press requires a non-empty key');
  if (['check','uncheck','setChecked'].includes(method)) {
    if (!element.matches('input[type=checkbox],input[type=radio]')) unsupported('check/uncheck/setChecked currently require an HTML checkbox or radio input');
    if (method === 'setChecked' && typeof options.checked !== 'boolean') unsupported('setChecked requires a boolean checked value');
    if (element.type === 'radio' && (method === 'uncheck' || method === 'setChecked' && !options.checked)) unsupported('A radio input cannot be unchecked by clicking it');
  }
  if (method === 'selectOption') {
    if (element.tagName !== 'SELECT') unsupported('selectOption requires an HTML select');
    const values = Array.isArray(options.value) ? options.value : [options.value];
    if (!values.length || values.some(value => typeof value !== 'string')) unsupported('selectOption currently accepts a string value or an array of string values');
    if (!element.multiple && values.length > 1) unsupported('A non-multiple select accepts one option');
    for (const value of values) if (![...element.options].some(option => option.value === value && !option.disabled && !option.parentElement?.disabled)) fail('LOCATOR_NOT_FOUND', `No enabled select option has value ${JSON.stringify(value)}`);
  }
  if (method === 'fill' && (element.readOnly || element.getAttribute('aria-readonly') === 'true')) fail('LOCATOR_NOT_ACTIONABLE', 'Locator element is readonly');
  if (['click','dblclick','check','uncheck','setChecked','selectOption'].includes(method)) {
    element.scrollIntoView({block:'center',inline:'center',behavior:'instant'});
    const after = element.getBoundingClientRect();
    const x = (Math.max(0,after.left)+Math.min(innerWidth,after.right))/2;
    const y = (Math.max(0,after.top)+Math.min(innerHeight,after.bottom))/2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) fail('LOCATOR_NOT_ACTIONABLE','Locator is outside the viewport');
    let hit = document.elementFromPoint(x,y);
    while (hit?.shadowRoot) { const inner=hit.shadowRoot.elementFromPoint?.(x,y); if (!inner || inner===hit) break; hit=inner; }
    let inside=false; for (let current=hit;current;current=parent(current)) if(current===element) {inside=true;break;}
    if (!inside) fail('LOCATOR_NOT_ACTIONABLE','Another element intercepts pointer input');
  }
  return element;
}
