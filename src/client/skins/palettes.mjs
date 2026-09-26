// Original color-only presets. Each tuple is [canvas, solid surface, accent].
// Layout, typography, effects and opacity remain owned by the selected theme.
const seeds = [
  ['mint', '薄荷', '自然绿', ['#f0faf6', '#fcfffd', '#116951'], ['#10231e', '#1a3029', '#77d6b1']],
  ['forest', '森林', '自然绿', ['#f0f5ef', '#fbfdf9', '#27553b'], ['#14221a', '#22332a', '#92cda0']],
  ['matcha', '抹茶', '自然绿', ['#f5f7e9', '#fdfef6', '#506226'], ['#202318', '#303628', '#b6cc87']],
  ['olive', '橄榄', '自然绿', ['#f7f6e8', '#fefdf4', '#575822'], ['#232215', '#353421', '#cecc86']],
  ['jade', '翡翠', '自然绿', ['#edf9f5', '#fafffd', '#116555'], ['#092522', '#143832', '#58d3bf']],
  ['bamboo', '竹影', '自然绿', ['#f2f6ee', '#fcfdf8', '#486342'], ['#1b251d', '#2a362b', '#adcfa0']],
  ['celadon', '青瓷', '青蓝', ['#f0f7f5', '#fbfefc', '#305d5a'], ['#122626', '#213837', '#9bccbf']],
  ['sea-salt', '海盐', '青蓝', ['#eef8fb', '#fbfeff', '#206677'], ['#10242e', '#1b3540', '#82cedd']],
  ['ocean', '深海', '青蓝', ['#eef4fc', '#fbfdff', '#1f5389'], ['#0c1c31', '#182d48', '#87baff']],
  ['indigo', '靛青', '青蓝', ['#f1f2fc', '#fdfdff', '#454aa3'], ['#181b34', '#262b4b', '#a7b0ff']],
  ['arctic', '极地', '青蓝', ['#f1f6f9', '#ffffff', '#315f86'], ['#162431', '#263744', '#bed9ec']],
  ['lavender', '薰衣草', '紫粉', ['#f6f2fb', '#fefcff', '#675099'], ['#251e35', '#362c4a', '#cbb4ef']],
  ['grape', '葡萄', '紫粉', ['#f8f0fa', '#fefbff', '#743d85'], ['#29182f', '#3c2646', '#d8a3ed']],
  ['dusk', '暮紫', '紫粉', ['#f6f1f5', '#fdfbfc', '#6d5267'], ['#2a202b', '#3c303f', '#d7b1cf']],
  ['lilac', '丁香', '紫粉', ['#f8f3f9', '#fffcff', '#755075'], ['#2a2230', '#3e3245', '#dac0e4']],
  ['sakura', '樱花', '紫粉', ['#fff1f6', '#fffafd', '#873e62'], ['#302129', '#46313e', '#f2b1d1']],
  ['rose', '玫瑰', '紫粉', ['#fff0f3', '#fffafb', '#a23456'], ['#301922', '#482836', '#ffa0ba']],
  ['berry', '莓果', '紫粉', ['#faf0f7', '#fffafd', '#8f355c'], ['#281727', '#3d263c', '#ee93cc']],
  ['coral', '珊瑚', '暖色', ['#fff3ee', '#fffcfa', '#943e2c'], ['#2d201d', '#432f29', '#ffb29d']],
  ['sunset', '落日', '暖色', ['#fff4e8', '#fffdf8', '#924019'], ['#2c211b', '#433127', '#ffc095']],
  ['amber', '琥珀', '暖色', ['#fcf7e8', '#fffdf6', '#79500a'], ['#272317', '#3b3521', '#efd07f']],
  ['latte', '奶咖', '暖色', ['#f5efe7', '#fdfaf5', '#704d34'], ['#28211d', '#3e332a', '#dcc0a4']],
  ['graphite', '石墨', '中性', ['#f0f3f6', '#fcfdff', '#4c5866'], ['#141a22', '#232c38', '#b6c7dc']],
  ['paper', '羊皮纸', '中性', ['#f6f1e5', '#fffbed', '#62533b'], ['#25231f', '#38352e', '#d8cdb3']],
];

function mix(a, b, amount) {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - amount)
    + parseInt(b.slice(i, i + 2), 16) * amount).toString(16).padStart(2, '0')).join('');
}
function modeTokens([bg, solid, accent], dark) {
  const text = mix(bg, dark ? '#ffffff' : '#000000', dark ? 0.92 : 0.88);
  return Object.freeze({
    bg, surface: solid, 'surface-solid': solid, sidebar: mix(bg, accent, dark ? 0.06 : 0.05),
    text, muted: mix(text, bg, 0.22), border: mix(solid, text, dark ? 0.23 : 0.20),
    hover: mix(solid, accent, 0.08), selected: mix(solid, accent, dark ? 0.16 : 0.14),
    accent, 'on-accent': dark ? bg : '#ffffff', focus: accent,
    success: dark ? '#94d6a3' : '#21633d', warning: dark ? '#edd084' : '#7c5609',
    danger: dark ? '#ffada9' : '#a83137', 'code-bg': mix(bg, solid, 0.5),
    'button-bg': accent, 'button-fg': dark ? bg : '#ffffff',
  });
}
// ':' is not allowed in imported skin ids, so palette-only ids cannot collide.
export const extraPalettes = Object.freeze(seeds.map(([id, name, group, light, dark]) => Object.freeze({
  id: `palette:${id}`, name, group,
  tokens: Object.freeze({ light: modeTokens(light, false), dark: modeTokens(dark, true) }),
})));
