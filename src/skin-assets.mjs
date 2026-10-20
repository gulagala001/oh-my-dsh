import { readFile } from 'node:fs/promises';

// Content-hashed bodies of large built-in skins; the client loads one on first use.
const directory = new URL('./client/skins/bundled/', import.meta.url);
const PREFIX = '/trisoul-x/api/skins/';
let files;
export async function handleSkinAsset(req, res, url) {
  if (!url.pathname.startsWith(PREFIX)) return false;
  files ??= new Set(Object.values(JSON.parse(await readFile(new URL('assets.json', directory), 'utf8'))));
  const name = url.pathname.slice(PREFIX.length);
  if (req.method !== 'GET' || !files.has(name)) { res.writeHead(req.method === 'GET' ? 404 : 405); res.end(); return true; }
  res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.end(await readFile(new URL(name, directory)));
  return true;
}
