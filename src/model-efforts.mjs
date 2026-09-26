const ranks = ['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
export const effortLabels = { off: '关闭', none: '关闭', minimal: '最低', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高', ultra: 'Ultra' };
/** Keep adapter-owned ids; never send the UI's Ultracode label as an API effort. */
export function highestEffort(reasoning) {
  const levels = reasoning?.efforts ?? [];
  if (!levels.length) return undefined;
  const known = levels.every(level => ranks.includes(level.id));
  return (known ? levels.toSorted((a, b) => ranks.indexOf(a.id) - ranks.indexOf(b.id)) : levels).at(-1)?.id;
}
export function effortChoices(model) {
  const reasoning = model?.reasoning;
  if (!reasoning?.efforts?.length) return [{ id: undefined, label: '默认' }];
  return [
    ...(reasoning.defaultEffort === undefined ? [{ id: undefined, label: '默认' }] : []),
    ...reasoning.efforts.map(level => ({ id: level.id, label: effortLabels[level.id] ?? level.name ?? level.id })),
  ];
}
