export const visibleMarkdown = text => text.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm, '');

export function documentLinks(value) {
  const output = [];
  for (const match of value.matchAll(/!?\[[^\]\n]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)) output.push(match[1] || match[2]);
  for (const match of value.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/gm)) output.push(match[1] || match[2]);
  for (const match of value.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)) output.push(match[1]);
  return output;
}
