import { colors } from './format.mjs';
import { extraPalettes } from './palettes.mjs';

// Existing theme colors stay available alongside the color-only catalog.
export const paletteNames = {
  'codex-desktop': '黑白灰', 'claude-cli-terminal': '暖砂',
  'ios-liquid-glass': '冰蓝', 'google-material-expressive': '晴空蓝',
};
export function paletteCatalog(skins) {
  return [...skins.map(({ id, name, tokens }) => ({ id, name: paletteNames[id] || name,
    group: paletteNames[id] ? '经典' : '导入主题', tokens })), ...extraPalettes];
}
const alphaCache = new Map();
export function colorAlpha(value = '') {
  if (alphaCache.has(value)) return alphaCache.get(value);
  let alpha = 1;
  if (/^#[\da-f]{8}$/i.test(value)) alpha = parseInt(value.slice(-2), 16) / 255;
  else if (/^#[\da-f]{4}$/i.test(value)) alpha = parseInt(value.slice(-1), 16) / 15;
  else if (value === 'transparent') alpha = 0;
  else if (typeof document !== 'undefined' && !/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value)) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = value; context.fillRect(0, 0, 1, 1);
    alpha = context.getImageData(0, 0, 1, 1).data[3] / 255;
  }
  if (alphaCache.size > 2048) alphaCache.clear();
  alphaCache.set(value, alpha); return alpha;
}
const opaque = value => /^#[\da-f]{8}$/i.test(value) ? value.slice(0, 7)
  : /^#[\da-f]{4}$/i.test(value) ? value.slice(0, 4)
  : /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(value) ? value : `rgb(from ${value} r g b / 1)`;
const tint = (color, base, amount) => `color-mix(in srgb, ${color} ${amount}%, ${base})`;
const materialColor = (color, template) => colorAlpha(template) === 1 ? opaque(color)
  : `rgb(from ${color} r g b / ${colorAlpha(template)})`;

export function composePalette(theme, source) {
  if (!source || source.id === theme?.id) return theme;
  const tokens = { common: { ...(theme?.tokens.common || {}) } };
  for (const mode of ['light', 'dark']) {
    const original = { ...theme?.tokens.common, ...theme?.tokens[mode] };
    const sourceValues = { ...source.tokens.common, ...source.tokens[mode] };
    const p = Object.fromEntries(colors.map(key => [key, opaque(sourceValues[key])]));
    // Source opacity never turns a solid theme into glass; opacity belongs to the theme.
    const values = Object.fromEntries(colors.map(key => [key, materialColor(p[key], original[key])]));
    const resolve = value => value.replace(/var\(\s*--omd-([a-z0-9-]+)\s*\)/g, (_, key) => resolve(sourceValues[key]));
    const button = opaque(resolve(sourceValues['button-bg'] || p.accent));
    const foreground = opaque(resolve(sourceValues['button-fg'] || p['on-accent']));
    const strongBubble = ['codex-desktop', 'ios-liquid'].includes(theme?.layout);
    Object.assign(values, {
      'button-bg': button, 'button-top': tint(button, '#ffffff', 85), 'sidebar-top': tint(p.sidebar, p['surface-solid'], 45), 'button-fg': foreground, 'button-hover': tint(button, p.text, 90),
      'switch-on': button, 'user-bg': strongBubble ? button : p.selected,
      'user-text': strongBubble ? foreground : p.text, 'on-user': strongBubble ? foreground : p.text,
      subtle: p['code-bg'], composer: p['surface-solid'], 'send-idle': p.muted, 'pane-line': p.border,
      'terminal-rule': p.border, 'terminal-add': tint(p.success, p.bg, 14), 'terminal-remove': tint(p.danger, p.bg, 14),
      'on-selected': p.text, 'surface-high': p.hover, 'outline-soft': p.border,
      'hero-glow': p.selected, 'error-container': tint(p.danger, p.bg, 14),
    });
    for (const [key, color] of Object.entries({ 'glass-edge': mode === 'light' ? p['surface-solid'] : p.text,
      'glass-sheen': mode === 'light' ? p['surface-solid'] : p.text, 'glass-control': p.surface,
      'glass-group': p.surface, 'glass-wash': p.bg })) {
      if (original[key]) values[key] = materialColor(color, original[key]);
    }
    if (original.wallpaper) values.wallpaper = `radial-gradient(ellipse at 3% 5%, ${tint(p.accent, 'transparent', 18)}, transparent 46%), radial-gradient(ellipse at 98% 95%, ${tint(p.selected, 'transparent', 30)}, transparent 45%), ${p.bg}`;
    tokens[mode] = { ...theme?.tokens[mode], ...values };
  }
  return { ...(theme || { id: 'default' }), tokens };
}
