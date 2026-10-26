import { estimateText } from '../metering/estimate.mjs';
import { encode, decode } from '@toon-format/toon';
import { createTwoFilesPatch } from 'diff';
import { isDeepStrictEqual } from 'node:util';

export const textOf = content => Array.isArray(content) && content.every(b => b.type === 'text') ? content.map(b => b.text).join('\n') : null;
export const protectedTool = name => /(?:^|__|_)(?:write|edit|patch|apply|delete|remove|kill|permission|approve|recall|context_view|code_search)(?:_|$)/i.test(name);
const risk = /\b(?:error|warning|warn|failed|failure|denied|cancelled|canceled|truncated)\b|截断|错误|警告|失败/i;
const readonly = /^(?:grep|glob|mcp__codegraph__(?:codegraph_)?(?:search|files|status|callers|callees|impact)|opencu_(?:state|targets|permissions|deliveries))$/;

// Lexical whitespace removal keeps number spelling, duplicate keys and escapes.
export function minifyJson(text) {
  try { JSON.parse(text); } catch { return null; }
  let out = '', quoted = false, escape = false;
  for (const c of text) {
    if (quoted) { out += c; if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
    else if (c === '"') { quoted = true; out += c; } else if (!/\s/.test(c)) out += c;
  }
  return out;
}
export function dataView(text) {
  const compact = minifyJson(text);
  if (compact === null) return null;
  let best = { text: compact, rule: 'json-whitespace', lossless: true };
  // Round trips are deliberately strict: unsafe numbers, duplicate keys and
  // alternate numeric/escape spellings stay lexical JSON, never parsed/rebuilt.
  const value = JSON.parse(compact);
  if (JSON.stringify(value) === compact && Array.isArray(value) && value.length > 2) {
    try {
      const toon = encode(value), view = 'TOON (lossless data):\n' + toon;
      if (view.length < best.text.length && isDeepStrictEqual(decode(toon), value)) best = { text: view, rule: 'toon', lossless: true };
    } catch { /* Unknown values retain lexical JSON. */ }
  }
  return best;
}
export function repeatedLines(text) {
  const lines = text.split('\n'), out = [];
  for (let i = 0; i < lines.length;) {
    let j = i + 1; while (j < lines.length && lines[j] === lines[i]) j++;
    if (j - i >= 4 && lines[i].length > 24) out.push(JSON.stringify({ repeatExactLine: lines[i], count: j - i, firstLine: i + 1 }));
    else out.push(...lines.slice(i, j));
    i = j;
  }
  return { text: out.join('\n'), rule: 'exact-line-runs', lossless: true };
}
function successfulTap(text, value) {
  if (value?.exitCode !== 0 || !/^TAP version 13\r?$/m.test(text) || !/^# fail 0\r?$/m.test(text) || !/^# cancelled 0\r?$/m.test(text)) return null;
  // Only the known Node TAP reporter grammar. User stdout, diagnostics, skips,
  // TODOs, unknown reporters and errors all keep their original output.
  const lines = text.split(/\r?\n/);
  if (lines.some(line => line && !/^(?:TAP version 13|# Subtest: .+|ok \d+ - .+|1\.\.\d+|# (?:tests|suites|pass|fail|cancelled|skipped|todo) \d+|# duration_ms [\d.]+|\s+(?:---|\.\.\.|duration_ms: [\d.]+|type: 'test'))$/.test(line))) return null;
  if (!/^# skipped 0$/m.test(text) || !/^# todo 0$/m.test(text)) return null;
  return { text: 'Node TAP success summary (timings/details omitted; original available):\n' + lines.filter(line => /^ok |^# (tests|suites|pass|fail|cancelled|skipped|todo) /.test(line)).join('\n'), rule: 'successful-tap', lossless: false };
}
export function reduceText(exec, result, text) {
  if (protectedTool(exec.name) || result.isError || risk.test(text) && !/^# fail 0$/m.test(text)) return null;
  if (['bash', 'pwsh'].includes(exec.name)) return successfulTap(text, result.value);
  if (!readonly.test(exec.name)) return null;
  const variants = [dataView(text), repeatedLines(text)].filter(Boolean);
  return variants.sort((a, b) => a.text.length - b.text.length)[0] ?? null;
}
export function readIdentity(exec, result) {
  if (exec.name !== 'read' || result.isError || !result.value || !Array.isArray(result.value.lines)) return null;
  const v = result.value;
  if (typeof v.path !== 'string' || !Number.isSafeInteger(v.totalLines) || !v.lines.every(l => Number.isSafeInteger(l.number) && typeof l.text === 'string')) return null;
  const text = textOf(result.content);
  if (text === null || /\(Output capped\.|\(line truncated to \d+ chars\)/.test(text)) return null;
  return JSON.stringify([v.path, exec.arguments?.offset ?? 0, exec.arguments?.limit ?? null]);
}
export function exactDelta(before, after) {
  return createTwoFilesPatch('previous-visible-result', 'current-result', before, after, '', '', { context: 3 });
}
export function referenced(view, record) {
  return `${view.text}\n[${view.lossless ? 'lossless view' : 'partial view'}; original=${record.ref}; sha256=${record.sourceHash}; recall(rawRef="${record.ref}")]`;
}
export function worthwhile(before, after) { return after.length + 128 < before.length && after.length <= before.length * .9 && estimateText(after) < estimateText(before); }
