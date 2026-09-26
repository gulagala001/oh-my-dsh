// Explicit visual overrides: omitted values always follow the selected theme.
export const fontChoices = {
  system: ['系统字体', 'system-ui, -apple-system, "Segoe UI", sans-serif'],
  sans: ['无衬线', 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif'],
  serif: ['衬线', 'Georgia, "Songti SC", "SimSun", serif'],
  mono: ['等宽', 'ui-monospace, "SFMono-Regular", Consolas, monospace'],
};
export const colorGroups = [
  ['页面与分区', { bg: '页面底色', sidebar: '左侧栏底色', conversation: '会话区底色', header: '会话顶栏底色', composer: '输入框底色', workbench: '工作台底色', 'surface-solid': '菜单与弹窗底色', 'code-bg': '代码底色', 'user-bg': '用户消息底色', 'user-text': '用户消息文字', 'tool-bg': '工具记录底色' }],
  ['文字与交互', { text: '正文颜色', muted: '辅助文字', accent: '强调色', 'on-accent': '强调色上的文字', border: '边框颜色', hover: '悬停底色', selected: '选中底色', focus: '焦点颜色', success: '成功颜色', warning: '警告颜色', danger: '错误颜色' }],
];
export const numberFields = {
  'font-size': ['界面字号', 12, 20, 1, 'px'], 'body-size': ['对话字号', 12, 24, 1, 'px'],
  'code-size': ['代码字号', 11, 22, 1, 'px'], 'line-height': ['正文行高', 1.3, 2.2, 0.05, ''],
  'radius-control': ['控件圆角', 0, 24, 1, 'px'], 'radius-panel': ['面板圆角', 0, 32, 1, 'px'],
  'radius-composer': ['输入框圆角', 0, 40, 1, 'px'], 'radius-message': ['消息圆角', 0, 32, 1, 'px'],
  'border-width': ['边框粗细', 0, 3, 0.5, 'px'], 'panel-blur': ['面板背景模糊', 0, 24, 1, 'px'],
};
export const advancedDefaults = () => ({ enabled: false, common: {}, light: {}, dark: {}, brand: { logo: 'theme', name: '', image: '', title: 'omd', titleText: '' } });
const colorKeys = new Set(colorGroups.flatMap(([, fields]) => Object.keys(fields)));
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const cleanText = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 60) : '';
export function normalizeAdvanced(value) {
  value = object(value); const result = advancedDefaults(), common = object(value.common), brand = object(value.brand);
  result.enabled = value.enabled === true;
  for (const mode of ['light', 'dark']) for (const [key, color] of Object.entries(object(value[mode]))) {
    if (colorKeys.has(key) && typeof color === 'string' && /^#[\da-f]{6}$/i.test(color)) result[mode][key] = color.toLowerCase();
  }
  for (const [key, [, min, max, step]] of Object.entries(numberFields)) {
    if (Number.isFinite(common[key])) result.common[key] = Number((Math.round(Math.min(max, Math.max(min, common[key])) / step) * step).toFixed(3));
  }
  for (const key of ['font-ui', 'font-body', 'font-mono']) if (Object.hasOwn(fontChoices, common[key])) result.common[key] = common[key];
  if (['none', 'soft', 'raised'].includes(common.shadow)) result.common.shadow = common.shadow;
  if (['theme', 'native', 'omd', 'custom'].includes(brand.logo)) result.brand.logo = brand.logo;
  if (['native', 'omd', 'custom'].includes(brand.title)) result.brand.title = brand.title;
  result.brand.name = cleanText(brand.name); result.brand.titleText = cleanText(brand.titleText);
  // Only locally decoded/re-encoded raster images can be used as a logo.
  if (typeof brand.image === 'string' && brand.image.length <= 180000 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(brand.image)) result.brand.image = brand.image;
  return result;
}
export async function prepareLogo(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file?.type) || file.size > 2 * 1024 * 1024) throw Error('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw Error('Logo 图片无法解码'); }
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16000000) throw Error('Logo 图片不能超过 1600 万像素');
    const scale = Math.min(1, 128 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally { bitmap.close(); }
}
const shadowValues = { none: 'none', soft: '0 2px 12px #00000012', raised: '0 8px 28px #00000026' };
export function advancedTokens(settings) {
  const tokens = { common: {}, light: {}, dark: {} };
  if (!settings.enabled) return tokens;
  for (const [key, value] of Object.entries(settings.common)) tokens.common[key] = fontChoices[value]?.[1] && key.startsWith('font-') ? fontChoices[value][1]
    : key === 'shadow' ? shadowValues[value] : `${value}${numberFields[key]?.[4] || ''}`;
  for (const mode of ['light', 'dark']) {
    const p = settings[mode]; tokens[mode] = { ...p };
    if (p['surface-solid']) tokens[mode].surface = p['surface-solid'];
    if (p.accent) Object.assign(tokens[mode], { 'button-bg': p.accent, 'switch-on': p.accent, 'button-top': p.accent, 'button-hover': `color-mix(in srgb, ${p.accent} 88%, var(--omd-text, var(--dsw-alias-label-primary)))` });
    if (p['on-accent']) tokens[mode]['button-fg'] = p['on-accent'];
    if (p['user-text']) tokens[mode]['on-user'] = p['user-text'];
  }
  return tokens;
}
const scope = 'html[data-omd-custom][data-appearance]';
const rule = (selector, declarations, prefix = scope) => `${prefix} :is(${selector}){${declarations}}`;
const paint = (selector, property, value, prefix) => rule(selector, `${property}:${value} !important;`, prefix);
export function advancedCss(settings) {
  if (!settings.enabled) return '';
  const tokens = advancedTokens(settings); let css = '';
  for (const [key, value] of Object.entries(tokens.common)) {
    const targets = {
      'font-ui': ['body, button, input, select, textarea, .tx-app, .cx-settings, .tx-wordmark, .YDXeBa_title', 'font-family'],
      'font-body': ['[data-chat-flow-kind], .hWmORq_body, .Sixlwa_bubble, .tx-cu-user-bubble, [data-composer-input]', 'font-family'],
      'font-mono': ['pre, code, pre code', 'font-family'],
      'font-size': ['[data-omd-surface="sidebar"], .YDXeBa_title, .VOzbGW_panel, .omd-appearance-row, .tx-app, .cx-settings, .tx-workbench', 'font-size'],
      'body-size': ['[data-chat-flow-kind], .hWmORq_body, .Sixlwa_bubble, .tx-cu-user-bubble, [data-composer-input]', 'font-size'],
      'code-size': ['pre, code, pre code', 'font-size'],
      'line-height': ['[data-chat-flow-kind], .hWmORq_body, .Sixlwa_bubble, [data-composer-input]', 'line-height'],
      'radius-control': ['button:not([role=switch]), select:not(.cx-scope-chip select), input:not([type=checkbox]):not([type=radio]):not([type=range]):not([data-composer-input]), .YDXeBa_sessionRow', 'border-radius'],
      'radius-panel': ['.VOzbGW_panel, [role=menu], dialog, .tx-card, .cx-card, [data-sidebar-right-panel][data-sidebar-right-open]', 'border-radius'],
      'radius-composer': ['[data-composer-card]', 'border-radius'],
      'radius-message': ['.Sixlwa_bubble, .tx-cu-user-bubble', 'border-radius'],
      'border-width': ['[data-composer-card], .VOzbGW_panel, .tx-card, .cx-card, pre', 'border-width'],
      shadow: ['[data-composer-card], .VOzbGW_panel, [role=menu], [data-sidebar-right-panel][data-sidebar-right-open]', 'box-shadow'],
    }[key];
    if (targets) css += paint(...targets, value);
    if (key === 'body-size') css += rule('.wSkVaW_root', `--dsh-content-font-size:${value};--dsh-content-font-size-secondary:calc(${value} - 2px);`);
    if (key === 'panel-blur') css += paint('[data-composer-card], [data-sidebar-right-panel][data-sidebar-right-open]', 'backdrop-filter', `blur(${value})`, `${scope}:not([data-omd-reduce-effects])`);
  }
  for (const mode of ['light', 'dark']) {
    const p = settings[mode], prefix = `${scope}[data-appearance="${mode}"]`;
    const region = (key, selectors, wallpaperScope) => {
      if (!p[key]) return;
      // Wallpaper remains behind the chosen region; custom region colors tint it.
      css += paint(selectors, 'background', p[key], `${prefix}:not([data-omd-background])`);
      css += paint(selectors, 'background', p[key], `${prefix}[data-omd-background="${wallpaperScope === 'sidebar' ? 'conversation' : 'sidebar'}"]`);
      if (key === 'sidebar' || key === 'conversation') css += rule(key === 'sidebar' ? '[data-omd-surface="sidebar-column"]' : '[data-omd-surface="conversation"]', `--omd-background-panel:color-mix(in srgb, ${p[key]} var(--omd-panel-opacity), transparent);`, prefix);
    };
    if (p.selected) css += paint('.YDXeBa_sessionRow.YDXeBa_selected, .VOzbGW_navCell[aria-current], .cx-tabs button[aria-current=page], .tx-tabs button[aria-selected=true]', 'background', p.selected, prefix);
    if (p.hover) css += paint('.YDXeBa_sessionRow:not(.YDXeBa_selected):hover, .hHd-Xa_newSession:hover, .hHd-Xa_panelRow:hover', 'background', p.hover, prefix);
    if (p.bg) css += paint('body, [data-omd-surface="frame"]', 'background', p.bg, `${prefix}:not([data-omd-background])`);
    region('sidebar', '[data-omd-surface="sidebar"]', 'sidebar');
    region('conversation', '[data-omd-surface="conversation"], .wSkVaW_root, .wSkVaW_body', 'conversation');
    region('header', '.wSkVaW_header', 'conversation');
    region('composer', '[data-composer-card]', 'conversation');
    if (p.composer) css += paint('[data-composer-card]', 'background', `color-mix(in srgb, ${p.composer} var(--omd-panel-opacity), transparent)`, `${prefix}[data-omd-background]:not([data-omd-background="sidebar"])`);
    for (const [key, selectors, property = 'background'] of [
      ['workbench', '.tx-workbench, .cx-integrated, [data-sidebar-right-panel][data-sidebar-right-open], [data-sidebar-right-panel][data-sidebar-right-open] [data-omd-surface="workbench-body"]'],
      ['surface-solid', '.VOzbGW_panel, .VOzbGW_content, .VOzbGW_options, [role=menu], dialog'],
      ['code-bg', 'pre, code:not(pre code)'], ['user-bg', '.Sixlwa_bubble, .tx-cu-user-bubble'],
      ['user-text', '.Sixlwa_bubble, .tx-cu-user-bubble', 'color'], ['tool-bg', '[data-disclosure-row], .tx-cu-card-heading'],
    ]) if (p[key]) css += paint(selectors, property, p[key], prefix);
  }
  return css;
}
