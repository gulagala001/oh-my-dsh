/** Fixed select descriptors and DOM selection shared by all browser transports. */
export function validateSelectOptions(value) {
  const invalid = message => { throw Object.assign(new Error(message), {code:'UNSUPPORTED_LOCATOR',details:{inputDispatched:false}}); };
  const values = Array.isArray(value) ? value : [value];
  if (!values.length) invalid('selectOption requires at least one option');
  return Array.from(values, item => {
    if (typeof item === 'string') return {value:item};
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid('selectOption accepts strings or descriptors with value, label, or index');
    const keys = Object.keys(item);
    if (!keys.length || keys.some(key => !['value','label','index'].includes(key))) invalid('selectOption descriptors support only value, label, and index');
    const result = {};
    for (const key of keys) {
      if (key === 'index' ? !Number.isSafeInteger(item[key]) || item[key] < 0 : typeof item[key] !== 'string') invalid(`selectOption ${key} must be ${key === 'index' ? 'a non-negative integer' : 'a string'}`);
      result[key] = item[key];
    }
    return result;
  });
}

export function selectOptionsDOM(element, value, apply = false) {
  const fail = (code, message) => { throw Object.assign(new Error(message), {code,details:{inputDispatched:false}}); };
  const descriptors = validateSelectOptions(value);
  if (!element?.isConnected) fail('STALE_ELEMENT', 'Selected select is no longer connected');
  if (element.tagName !== 'SELECT') fail('UNSUPPORTED_LOCATOR', 'selectOption requires an HTML select');
  for (let current = element; current?.nodeType === 1; current = current.parentElement ?? current.getRootNode()?.host) {
    if (current.matches(':disabled') || current.getAttribute('aria-disabled') === 'true' || current.inert) fail('LOCATOR_NOT_ACTIONABLE', 'Selected select is disabled');
  }
  const options = [...element.options], selected = new Set();
  let remaining = descriptors;
  const matches = (option, index, descriptor) => (descriptor.value === undefined || option.value === descriptor.value) && (descriptor.label === undefined || option.label === descriptor.label) && (descriptor.index === undefined || index === descriptor.index);
  for (const [index, option] of options.entries()) {
    if (!remaining.some(descriptor => matches(option,index,descriptor)) || option.disabled || option.parentElement?.disabled) continue;
    selected.add(option);
    remaining = element.multiple ? remaining.filter(descriptor => !matches(option,index,descriptor)) : [];
    if (!remaining.length) break;
  }
  if (remaining.length) fail(options.some((option,index) => remaining.some(descriptor => matches(option,index,descriptor))) ? 'LOCATOR_NOT_ACTIONABLE' : 'LOCATOR_NOT_FOUND', `No enabled select option matches ${JSON.stringify(remaining)}`);
  const values = options.filter(option => selected.has(option)).map(option => option.value);
  // Resolve every descriptor before changing selection or dispatching any event.
  if (apply) {
    try {
      element.selectedIndex = -1;
      for (const option of options) option.selected = selected.has(option);
      element.dispatchEvent(new Event('input', {bubbles:true,composed:true}));
      element.dispatchEvent(new Event('change', {bubbles:true}));
    } catch (cause) {
      // Page-owned setters and dispatchEvent cannot reclassify partial input as safe to retry.
      throw Object.assign(new Error('selectOption failed after selection dispatch began', {cause}), {code:'LOCATOR_ACTION_FAILED',details:{inputDispatched:true,effectVerified:false}});
    }
  }
  return values;
}

export const selectOptionsDOMSource = `(function(element,value,apply) { const validateSelectOptions = ${validateSelectOptions.toString()}; return (${selectOptionsDOM.toString()})(element,value,apply); })`;
export const selectOptionsFunction = `function(value) { try { return {selected:${selectOptionsDOMSource}(this,value,true)}; } catch(error) { if (error.details?.inputDispatched !== false) throw error; return {__opencuSelectError:{code:error.code,message:error.message}}; } }`;
export function selectOptionsResult(value) {
  if (value?.__opencuSelectError) throw Object.assign(new Error(value.__opencuSelectError.message), {code:value.__opencuSelectError.code,details:{inputDispatched:false}});
  return value;
}
