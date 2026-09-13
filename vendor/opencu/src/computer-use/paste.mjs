import { Marked } from 'marked';
import { compile } from 'html-to-text';

const markdown = new Marked({ gfm: true, async: false });
const plainText = compile({ wordwrap: false, selectors: [
  { selector: 'a', options: { ignoreHref: true } },
  { selector: 'img', format: 'skip' },
  { selector: 'h1', options: { uppercase: false } },
  { selector: 'h2', options: { uppercase: false } },
  { selector: 'h3', options: { uppercase: false } },
  { selector: 'h4', options: { uppercase: false } },
  { selector: 'h5', options: { uppercase: false } },
  { selector: 'h6', options: { uppercase: false } },
] });

// Pure conversion: no browser, document execution or resource loading in the
// host. The destination app chooses a supported clipboard representation.
export function nativePastePayload(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('paste text must be a string.');
  const format = options?.format ?? 'text';
  if (!['text', 'md', 'html'].includes(format)) throw new TypeError('paste format must be text, md or html.');
  if (format === 'text') return { text };
  const html = format === 'md' ? markdown.parse(text) : text;
  return { text: plainText(html), html };
}
