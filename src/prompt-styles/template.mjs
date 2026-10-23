// Render only the if/elif/else and variable constructs present in this fixed source.
// Fail closed on new template syntax so an upstream update cannot leak placeholders.
export function renderTemplate(text, values) {
  const keyPattern = /^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*$/;
  const checkedKey = key => {
    key = key.trim();
    if (!keyPattern.test(key)) throw new Error(`Unsupported Grok template expression: ${key}`);
    return key;
  };
  const get = key => values[checkedKey(key)] ?? '';
  const defined = key => Object.hasOwn(values, key) || Object.keys(values).some(value => value.startsWith(key + '.'));
  const termValue = term => {
    term = term.trim();
    if (term.startsWith('not ')) return !termValue(term.slice(4));
    const equality = term.match(/^([A-Za-z_][A-Za-z_0-9.]*)\s*==\s*("(?:[^"\\]|\\.)*")$/);
    if (equality) return get(equality[1]) === JSON.parse(equality[2]);
    if (term.endsWith(' is defined')) return defined(checkedKey(term.slice(0, -11)));
    return Boolean(get(term));
  };
  const condition = expression => expression.split(' or ').map(group => group.split(' and ').map(termValue).every(Boolean)).some(Boolean);
  const stack = [];
  let visible = true;
  let output = '';
  const chunks = text.split(/(\$\{%[\s\S]*?%\}|\$\{\{[\s\S]*?\}\})/g);
  for (let chunk of chunks) {
    if (chunk.startsWith('${%')) {
      const statement = chunk.slice(3, -2).replace(/^-|-$|^\s+|\s+$/g, '').trim();
      if (statement.startsWith('if ')) {
        const matches = condition(statement.slice(3));
        stack.push({ parent: visible, matched: matches });
        visible = visible && matches;
      } else if (statement.startsWith('elif ')) {
        const frame = stack.at(-1);
        if (!frame) throw new Error('Grok template elif without if');
        const matches = !frame.matched && condition(statement.slice(5));
        frame.matched ||= matches;
        visible = frame.parent && matches;
      } else if (statement === 'else') {
        const frame = stack.at(-1);
        if (!frame) throw new Error('Grok template else without if');
        visible = frame.parent && !frame.matched;
        frame.matched = true;
      } else if (statement === 'endif') {
        const frame = stack.pop();
        if (!frame) throw new Error('Grok template endif without if');
        visible = frame.parent;
      } else throw new Error(`Unsupported Grok template statement: ${statement}`);
    } else if (visible) {
      output += chunk.startsWith('${{') ? String(get(chunk.slice(3, -2))) : chunk;
    }
  }
  if (stack.length) throw new Error('Unclosed Grok template if');
  return output.replace(/\n{3,}/g, '\n\n').trim();
}
