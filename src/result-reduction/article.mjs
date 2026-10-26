import { createHash } from 'node:crypto';
const articles = new Map();
let retainedBytes = 0;
export function clearArticleCache() { articles.clear(); retainedBytes = 0; }
export async function articleView(html, url = 'https://document.invalid/') {
  const key = createHash('sha256').update(url, 'utf16le').update('\0').update(html, 'utf16le').digest('hex');
  const cached = articles.get(key);
  if (cached) { articles.delete(key); articles.set(key, cached); return { ...cached.value }; }
  const [{ Readability }, { JSDOM }] = await Promise.all([import('@mozilla/readability'), import('jsdom')]);
  // Preserve the parser and its options; no page scripts or resources execute.
  const dom = new JSDOM(html, { url });
  try {
    const article = new Readability(dom.window.document, { maxElemsToParse: 100000, charThreshold: 100 }).parse();
    if (!article?.textContent?.trim()) throw Error('没有识别出文章正文；可读取原文或查询片段');
    const value = { title: article.title, byline: article.byline, text: article.textContent.trim() };
    const bytes = (value.title?.length ?? 0) * 2 + (value.byline?.length ?? 0) * 2 + value.text.length * 2 + 256;
    if (bytes <= 2 * 1024 * 1024) {
      while (articles.size && (articles.size >= 8 || retainedBytes + bytes > 2 * 1024 * 1024)) {
        const [oldKey, old] = articles.entries().next().value; articles.delete(oldKey); retainedBytes -= old.bytes;
      }
      articles.set(key, { value, bytes }); retainedBytes += bytes;
    }
    return { ...value };
  } finally { dom.window.close(); }
}
