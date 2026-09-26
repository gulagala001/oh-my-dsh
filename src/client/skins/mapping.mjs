// The host presenter applies these aliases on body, including portal children.
const aliases = {
  'bg-base': 'bg', 'bg-document-preview': 'bg', 'label-document-preview': 'text',
  'bg-layer-1': 'surface', 'bg-layer-2': 'surface-solid', 'bg-layer-3': 'surface-solid',
  'label-primary': 'text', 'label-primary-bluish': 'text', 'label-secondary': 'muted', 'label-tertiary': 'muted', 'label-caption': 'muted',
  'label-primary-foreground': 'button-fg', 'brand-primary': 'accent', 'brand-text': 'accent', 'link': 'accent',
  'border-l1': 'border', 'border-l2': 'border', 'border-l3': 'border', 'border-l4': 'border',
  'interactive-bg-hover': 'hover', 'interactive-bg-hover-solid': 'hover', 'interactive-bg-active': 'selected',
  'button-primary-fill': 'button-bg', 'button-primary-hover': 'button-hover', 'button-contrast-fill': 'button-bg', 'button-floating-fill': 'surface-solid',
  'markdown-code-block': 'code-bg', 'markdown-code-block-banner': 'surface-solid', 'markdown-inline-code': 'code-bg',
  'state-error-primary': 'danger', 'state-error-secondary': 'danger', 'state-success-primary': 'success', 'state-success-secondary': 'success', 'state-warn-primary': 'warning', 'state-warn-secondary': 'warning',
  'toast-bg': 'surface-solid', 'tooltip-bg': 'surface-solid',
};
export function hostTokens(skin) {
  const palette = mode => ({
    'button-bg': skin.tokens[mode].accent,
    'button-fg': skin.tokens[mode]['on-accent'],
    'button-hover': `color-mix(in srgb, var(--omd-button-bg) 90%, var(--omd-text))`,
    ...skin.tokens.common, ...skin.tokens[mode],
  });
  const light = palette('light'), dark = palette('dark');
  return Object.fromEntries(Object.entries(aliases).map(([alias, key]) => [`--dsw-alias-${alias}`, { light: light[key], dark: dark[key] }]));
}
export function tokenCss(skin, scope = `html.omd[data-omd-skin="${skin.id}"]`) {
  const defaults = { 'button-bg': 'var(--omd-accent)', 'button-fg': 'var(--omd-on-accent)', 'button-hover': 'color-mix(in srgb, var(--omd-button-bg) 90%, var(--omd-text))' };
  return ['common', 'light', 'dark'].map(mode => `${scope}${mode === 'common' ? '' : `[data-appearance="${mode}"]`}{${Object.entries(mode === 'common' ? { ...defaults, ...skin.tokens.common } : skin.tokens[mode]).map(([key, value]) => `--omd-${key}:${value}`).join(';')}}`).join('\n');
}

// Partial overrides use mode-scoped CSS so the other mode retains its own host
// values (the theme service requires complete light/dark pairs).
export function customTokenCss(tokens) {
  return ['common', 'light', 'dark'].map(mode => {
    const prefix = 'html[data-omd-custom][data-appearance]' + (mode === 'common' ? '' : `[data-appearance="${mode}"]`);
    const values = tokens[mode];
    const declarations = Object.entries(values).map(([key, value]) => `--omd-${key}:${value}`).join(';');
    const specific = { 'specific-sidebar-nav-item-active': 'selected', 'specific-sidebar-nav-item-active-accent': 'selected', 'specific-sidebar-nav-item-hover': 'hover', 'specific-input-major': 'composer', 'specific-menu': 'surface-solid', 'specific-selector': 'surface-solid', 'specific-bubble': 'user-bg' };
    const mapped = Object.entries(aliases).filter(([, key]) => values[key] !== undefined).map(([alias, key]) => `--dsw-alias-${alias}:${values[key]} !important`).join(';');
    const native = Object.entries(specific).filter(([, key]) => values[key] !== undefined).map(([alias, key]) => `--dsw-${alias}:${values[key]} !important`).join(';');
    const locals = { bg: ['--tx-bg', '--cx-bg'], text: ['--tx-text', '--cx-text'], muted: ['--tx-muted', '--cx-muted'], border: ['--tx-line', '--cx-line'], accent: ['--tx-blue', '--cx-blue'], selected: ['--tx-tint', '--cx-tint'], hover: ['--tx-hover', '--cx-hover'], danger: ['--tx-danger'] };
    const local = Object.entries(locals).flatMap(([key, names]) => values[key] === undefined ? [] : names.map(name => `${name}:${values[key]} !important`)).join(';');
    return `${prefix}{${declarations}}${prefix} body{${mapped};${native}}${prefix} :is(.tx-app,.tx-workbench,.tx-composer-dock,.tx-bt-notice,.tx-bt-option,.tx-scope-chip,.tx-stats-line,.cx-settings,.cx-panel,.cx-integrated,.cx-scope-chip){${local}}`;
  }).join('\n');
}
