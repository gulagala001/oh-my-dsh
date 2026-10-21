// Convert decimal UI units to exact integer storage units (ms/tokens), including
// minutes and days. Floating multiplication can reject valid values like 1.001s.
export function scaledSettingValue(raw, scale = 1, integer = true) {
  const match = /^([+-]?)(\d*\.?\d+|\d+\.)(?:e([+-]?\d+))?$/i.exec(raw);
  if (!match || !Number.isFinite(Number(raw) * scale)) return NaN;
  if (!integer) return Number(raw) * scale;
  if (!Number.isSafeInteger(scale) || scale <= 0) return NaN;
  const fraction = match[2].split('.')[1]?.length || 0;
  const exponent = Number(match[3] || 0) - fraction;
  let units = BigInt(match[2].replace('.', '')) * BigInt(scale);
  if (units === 0n) return 0;
  if (exponent > 16 || -exponent > units.toString().length) return NaN;
  if (exponent >= 0) units *= 10n ** BigInt(exponent);
  else {
    const divisor = 10n ** BigInt(-exponent);
    if (units % divisor) return NaN;
    units /= divisor;
  }
  const value = Number(match[1] === '-' ? -units : units);
  return Number.isSafeInteger(value) ? value : NaN;
}

export function savedBackground(current, value, submitted) {
  const changed = current.text !== submitted;
  return { ...current, text: changed ? current.text : value.text, saved: value.text, revision: value.revision,
    status: changed ? '提交内容已保存；新修改尚未保存' : '已保存', conflict: false, latest: null, busy: false };
}
