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
