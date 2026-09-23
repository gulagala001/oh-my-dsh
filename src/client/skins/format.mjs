// Shared by the browser importer and the asset packer. No runtime code in skins.
export const SKIN_VERSION = 1;
export const MAX_SKIN_BYTES = 1024 * 1024;
export const colors = ['bg', 'surface', 'surface-solid', 'sidebar', 'text', 'muted', 'border', 'hover', 'selected', 'accent', 'on-accent', 'focus', 'success', 'warning', 'danger', 'code-bg'];
export const geometry = {
  'font-ui': 'font-family', 'font-body': 'font-family', 'font-mono': 'font-family',
  'font-size': 'font-size', 'line-height': 'line-height', gap: 'gap',
  'radius-control': 'border-radius', 'radius-panel': 'border-radius', 'radius-composer': 'border-radius',
  shadow: 'box-shadow', duration: 'transition-duration',
};
export function validateSkin(value, supports) {
  if (!value || value.schemaVersion !== SKIN_VERSION) throw new Error('不支持的皮肤格式版本');
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(value.id) || value.id === 'default') throw new Error('皮肤 id 必须是小写英文、数字和连字符，且不能是 default');
  for (const field of ['name', 'version']) if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > 80) throw new Error(`缺少有效的 ${field}`);
  const tokens = {};
  for (const mode of ['common', 'light', 'dark']) {
    const input = value.tokens?.[mode];
    const keys = mode === 'common' ? Object.keys(geometry) : colors;
    if (!input || typeof input !== 'object' || Array.isArray(input) || keys.some(key => !Object.hasOwn(input, key)) || Object.keys(input).length > 96) throw new Error(`${mode} 参数不完整或超过 96 项`);
    tokens[mode] = {};
    for (const key of Object.keys(input)) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(key)) throw new Error(`无效的参数名称：${key}`);
      const v = input[key];
      const property = mode === 'common' ? geometry[key] : colors.includes(key) ? 'color' : geometry[key];
      if (typeof v !== 'string' || !v.trim() || v.length > 300 || /[;{}<>\\]|\/\*|url\s*\(|!important|^(initial|inherit|unset|revert)/i.test(v) || property && /var\s*\(/i.test(v) || supports && property && !supports(property, v)) throw new Error(`${mode}/${key} 不是有效的 ${property || 'CSS 值'}`);
      tokens[mode][key] = v.trim();
    }
  }
  // Additional visual tokens may refer to this skin's values; reject missing
  // references and cycles before they can silently invalidate native styles.
  for (const mode of ['light', 'dark']) {
    const values = { ...tokens.common, ...tokens[mode] };
    const resolved = new Map();
    const resolve = (key, trail = new Set()) => {
      if (!Object.hasOwn(values, key) || trail.has(key)) throw new Error(`${mode}/${key} 引用了缺失或循环参数`);
      if (resolved.has(key)) return resolved.get(key);
      const next = new Set(trail); next.add(key);
      const value = values[key].replace(/var\(\s*--omd-([a-z0-9-]+)\s*\)/g, (_, name) => resolve(name, next));
      if (/var\s*\(/i.test(value)) throw new Error('派生参数只允许 var(--omd-本套参数)');
      resolved.set(key, value); return value;
    };
    for (const key of Object.keys(values)) resolve(key);
  }
  if (typeof (value.css ?? '') !== 'string') throw new Error('css 必须是文本');
  // Layouts are shipped, tested host adapters; imported skins cannot inject layout CSS.
  if (value.layout !== undefined && !['ios-liquid', 'codex-desktop', 'claude-cli-terminal', 'google-material-expressive'].includes(value.layout)) throw new Error('不支持的皮肤布局');
  const result = { schemaVersion: SKIN_VERSION, id: value.id, name: value.name.trim(), version: value.version.trim(), tokens, css: value.css || '' };
  if (value.layout) result.layout = value.layout;
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_SKIN_BYTES) throw new Error('皮肤包不能超过 1 MB');
  return result;
}

// Semantic aliases are owned by OMD, not by skin authors. Host module names stay here.
export const parts = {
  sidebar: '.hHd-Xa_root', header: '.wSkVaW_header', conversation: '.wSkVaW_root',
  composer: '[data-composer-card]', input: '[data-composer-input]',
  tool: '[data-disclosure-row]', workbench: '.tx-workbench, .cx-integrated',
  settings: '.cx-settings, .omd-appearance', dialog: '[role="dialog"], dialog',
  menu: '[role="menu"]', code: 'pre, code', button: 'button',
  'settings-shell': '.VOzbGW_panel', 'settings-nav': '.VOzbGW_nav',
  'settings-nav-item': '.VOzbGW_navCell',
  'settings-content': '.VOzbGW_content, .VOzbGW_options',
  'settings-row': '.omd-appearance-row, .cx-field, .tx-field, .cx-toggle',
  'settings-tabs': '.cx-tabs, .tx-tabs',
  tab: '.cx-tabs > button, .tx-tabs > button, .wSkVaW_tab',
  segments: '.cx-segments, .tx-segments',
  segment: '.cx-segments > button, .tx-segments > button',
  'form-control': 'select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([data-composer-input]), textarea:not([data-composer-input])',
  'field-input': 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), textarea:not([data-composer-input])',
  select: 'select', checkbox: 'input[type="checkbox"]:not([role="switch"])',
  switch: 'input[role="switch"], button[role="switch"]',
  'file-input': 'input[type="file"]',
  savebar: '.cx-savebar, .cx-actions, .omd-appearance-actions',
  'button-primary': '.tx-button.tx-primary, .cx-btn.primary, .uV2eYG_primary',
  'button-quiet': '.tx-button.tx-quiet',
  'icon-button': '.tx-icon-button, .uV2eYG_add, .VOzbGW_close',
  send: '.uV2eYG_primary',
  'sidebar-row': '.YDXeBa_sessionRow, .hHd-Xa_newSession',
  'message-user': '.Sixlwa_bubble, .tx-cu-user-bubble',
  'process-toggle': '.tx-cu-group-toggle, .omd-record-toggle',
  'tool-group': '[data-step-process-body]',
  'tool-row': '[data-disclosure-row], .tx-cu-card-heading, .CY-8Ka_root, .o3BgMG_row',
  'code-block': 'pre', 'code-inline': 'code:not(pre code)',
  statusbar: '.tx-stats-line, [data-composer-stats], .bOPqQW_root',
};
const partStates = {
  selected: ':is([aria-selected="true"], [aria-current="true"], [aria-current="page"], [aria-pressed="true"], .YDXeBa_selected, .wSkVaW_tabActive)',
  checked: ':is(:checked, [aria-checked="true"])',
  disabled: ':is(:disabled, [aria-disabled="true"])',
};
export const visualProperties = new Set(['background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'color', 'border', 'border-color', 'border-width', 'border-style', 'border-radius', 'box-shadow', 'text-shadow', 'backdrop-filter', '-webkit-backdrop-filter', 'font-family', 'font-weight', 'font-variant-numeric', 'letter-spacing', 'accent-color', 'caret-color', 'outline', 'outline-color', 'outline-width', 'outline-style', 'outline-offset']);

// CSSOM expands shorthands during enumeration.
for (const side of ['top', 'right', 'bottom', 'left']) for (const kind of ['width', 'style', 'color']) visualProperties.add(`border-${side}-${kind}`);
for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right']) visualProperties.add(`border-${corner}-radius`);
for (const property of ['background-attachment', 'background-origin', 'background-clip', 'background-position-x', 'background-position-y', 'border-image-source', 'border-image-slice', 'border-image-width', 'border-image-outset', 'border-image-repeat']) visualProperties.add(property);

// Keep declaration boundaries before CSSOM expands variable shorthands. Parsing
// declarations one at a time preserves both their values and later overrides.
function cssBoundaries(text, separators) {
  const points = []; let quote = '', depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (!depth && separators.includes(c)) points.push(i);
    if (depth < 0) throw new Error('原生样式括号不完整');
  }
  if (quote || depth) throw new Error('原生样式字符串或括号不完整');
  return points;
}
function cssBlocks(text) {
  const blocks = []; let depth = 0, start = 0, bodyStart = 0;
  for (const i of cssBoundaries(text, '{}')) {
    if (text[i] === '{') { if (depth++ === 0) bodyStart = i + 1; }
    else {
      if (--depth < 0) throw new Error('原生样式规则不完整');
      if (!depth) { blocks.push({ raw: text.slice(start, i + 1), body: text.slice(bodyStart, i) }); start = i + 1; }
    }
  }
  if (depth || text.slice(start).trim()) throw new Error('原生样式规则不完整');
  return blocks;
}

// Browser CSSOM validates every rule and declaration; only its serialized values
// and our own scoped selectors are emitted, never arbitrary author selectors.
export function compileSkinCss(css, id, Sheet = CSSStyleSheet) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\\|@import|\/\*/.test(css)) throw new Error('原生样式不支持转义或 @import');
  // A fixed author priority wins over host defaults. Mapping complexity must
  // not make broad form/button aliases override more specific skin rules.
  const scope = `html.omd[data-omd-skin="${id}"][data-appearance]`;
  const parse = text => { const sheet = new Sheet(); sheet.replaceSync(text); if (sheet.cssRules.length !== 1) throw new Error('无效的原生样式规则'); return sheet.cssRules[0]; };
  const render = source => cssBlocks(source).map(({ raw, body }) => {
    const rule = parse(raw);
    if (rule.type === 4 || rule.type === 12) return `${rule.type === 4 ? '@media' : '@supports'} ${rule.conditionText}{${render(body)}}`;
    if (rule.type === 5) {
      const allowed = new Set(['font-family', 'src', 'font-weight', 'font-style', 'font-display', 'unicode-range', 'font-stretch', 'font-feature-settings']);
      if (!rule.style.getPropertyValue('font-family') || !rule.style.getPropertyValue('src')) throw new Error('字体定义缺少名称或源文件');
      for (const p of rule.style) {
        const value = rule.style.getPropertyValue(p);
        if (!allowed.has(p) || rule.style.getPropertyPriority(p) || /[\\<>]/.test(value)) throw new Error('不支持的字体声明');
        if (p === 'src' && !/^url\(["']?data:font\/(?:woff2?|ttf|otf);base64,[a-z0-9+/=]+["']?\)(?:\s+format\(["']?(?:woff2?|truetype|opentype)["']?\))?$/i.test(value)) throw new Error('字体必须内嵌在皮肤包中');
      }
      return rule.cssText;
    }
    if (rule.type !== 1 || rule.cssRules?.length) throw new Error('原生样式仅支持组件规则、@font-face、@media 和 @supports');
    const selectors = rule.selectorText.split(',').map(s => {
      const m = s.trim().match(/^\.omd(?:\[data-appearance=["']?(light|dark)["']?\])?(?:\s+\[data-omd-part=["']?([a-z][a-z0-9-]*)["']?\])?(?:\[data-omd-state=["']?(selected|checked|disabled)["']?\])?((?::(?:hover|active|focus-visible|focus-within|disabled|checked))?)$/);
      if (!m || m[2] && !parts[m[2]] || m[3] && !m[2]) throw new Error(`不支持的皮肤选择器：${s}`);
      return scope + (m[1] ? `[data-appearance="${m[1]}"]` : '') + (m[2] ? ` :where(${parts[m[2]]})` : '') + (partStates[m[3]] || '') + m[4];
    });
    let start = 0;
    const declarations = [...cssBoundaries(body, ';'), body.length].map(end => {
      const text = body.slice(start, end).trim(); start = end + 1;
      if (!text) return '';
      const style = parse(`.omd{${text}}`).style;
      if (!style?.length) return ''; // Unsupported browser-specific fallback, e.g. -webkit-backdrop-filter.
      for (const p of style) if (!visualProperties.has(p) || style.getPropertyPriority(p)) throw new Error(`不支持的原生样式属性：${p}`);
      const parsed = style.cssText;
      const stripped = parsed.replace(/url\(\s*["']?data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/=]+["']?\s*\)/gi, '');
      if (/url\s*\(|image-set\s*\(|[\\<>]/i.test(stripped)) throw new Error('原生样式只能引用包内图片');
      return parsed;
    });
    return `${selectors.join(',')}{${declarations.join(' ')}}`;
  }).join('\n');
  return render(css);
}
