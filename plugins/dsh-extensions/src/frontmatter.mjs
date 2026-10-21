import { parseDocument, stringify } from 'yaml';

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Split Markdown with YAML frontmatter; `data` is null when there is none. */
export function splitFrontmatter(text) {
  const match = FENCE.exec(text);
  if (!match) return { data: null, yaml: '', body: text };
  const document = parseDocument(match[1]);
  if (document.errors.length) throw Object.assign(Error(document.errors[0].message), { code: 'invalid-frontmatter' });
  const data = document.toJS() ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw Object.assign(Error('Frontmatter must be a mapping'), { code: 'invalid-frontmatter' });
  return { data, yaml: match[1], body: text.slice(match[0].length) };
}

/** Rewrite top-level keys in place, keeping comments, order and the body; `undefined` removes a key. */
export function updateFrontmatter(text, changes) {
  const match = FENCE.exec(text);
  const document = parseDocument(match ? match[1] : '');
  if (document.errors.length) throw Object.assign(Error(document.errors[0].message), { code: 'invalid-frontmatter' });
  if (!document.contents) document.contents = document.createNode({});
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) document.delete(key); else document.set(key, value);
  }
  const yaml = document.toString().trimEnd();
  const body = match ? text.slice(match[0].length) : text;
  return `---\n${yaml}\n---\n${body}`;
}

export function composeFrontmatter(data, body) {
  const fields = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined && value !== ''));
  if (!Object.keys(fields).length) return `${body.trim()}\n`;
  return `---\n${stringify(fields).trimEnd()}\n---\n\n${body.trim()}\n`;
}
