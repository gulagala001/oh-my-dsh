#!/usr/bin/env node
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, dirname, extname, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateSkin, MAX_SKIN_BYTES } from '../src/client/skins/format.mjs';

export async function packSkin(directory, output) {
  const folder = await realpath(directory);
  const metadata = JSON.parse(await readFile(resolve(folder, 'skin.json'), 'utf8'));
  let source = (await readFile(resolve(folder, 'tokens.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const fonts = [];
  source = source.replace(/@font-face\s*\{[^{}]*\}/gi, rule => { fonts.push(rule); return ''; });
  const tokens = {};
  const remainder = source.replace(/\.omd(?:\[data-appearance=["'](light|dark)["']\])?\s*\{([^{}]*)\}/g, (_, mode, body) => {
    const key = mode || 'common';
    if (tokens[key]) throw new Error(`重复的 ${key} 参数块`);
    tokens[key] = {};
    const leftover = body.replace(/--omd-([a-z-]+)\s*:\s*([^;]+);/g, (_, name, value) => {
      if (Object.hasOwn(tokens[key], name)) throw new Error(`重复参数 ${name}`);
      tokens[key][name] = value.trim(); return '';
    });
    if (leftover.trim()) throw new Error(`${key} 含不支持的参数声明`);
    return '';
  });
  if (remainder.trim()) throw new Error('tokens.css 仅支持 .omd 和两个 data-appearance 参数块');
  let css = '';
  try { css = await readFile(resolve(folder, 'native.css'), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  css = fonts.join('\n') + '\n' + css;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const references = [...css.matchAll(/url\(\s*["']?([^\s)"']+)["']?\s*\)/g)];
  for (const match of references) {
    const name = match[1].replace(/^\.\//, '');
    if (!name.startsWith('assets/')) throw new Error('native.css 素材路径必须位于本套 assets/');
    const path = await realpath(resolve(folder, name));
    const rel = relative(resolve(folder, 'assets'), path);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('素材不能越过 assets 目录');
    const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' }[extname(path).toLowerCase()];
    if (!mime) throw new Error(`不支持的素材格式：${name}`);
    const bytes = await readFile(path);
    css = css.replace(match[0], `url("data:${mime};base64,${bytes.toString('base64')}")`);
  }
  const skin = validateSkin({ ...metadata, tokens, css });
  const destination = resolve(output || resolve(folder, 'deliverables', `${skin.id}.omd-skin.json`));
  const content = JSON.stringify(skin, null, 2) + '\n';
  if (Buffer.byteLength(content) > MAX_SKIN_BYTES) throw new Error('皮肤包不能超过 1 MB');
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content);
  return destination;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('用法：node scripts/pack-skin.mjs <皮肤目录> [输出文件]');
    console.log(await packSkin(process.argv[2], process.argv[3]));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
