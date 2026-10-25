import { execFileSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, '');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const allowed = /^(?:src\/(?:index|engine|shared)\.mjs|test\/continuation\.test\.mjs|scripts\/(?:check-docs|check-public-files)\.mjs|docs\/(?:documentation\.md|structure\.json)|README(?:_EN)?\.md|CHANGELOG\.md|CONTRIBUTING\.md|LICENSE|package(?:-lock)?\.json|cordis\.patch\.yml|\.gitignore|\.github\/workflows\/ci\.yml)$/;

const forbidden = path => /(?:^|\/)(?:AGENTS|CLAUDE|AI_README|PLAN|REFERENCE|COMPONENT-ALLOCATION|.*HANDOFF.*|PROMPT_(?:MAINTENANCE|CHANGES))\.md$/i.test(path)
  || /(?:^|\/)[^/]*(?:raw[-_ ](?:research|review|audit)|prompt[-_ ]maintenance|agent[-_ ](?:allocation|handoff)|session[-_ ](?:transcript|archive))[^/]*$/i.test(path)
  || /(?:^|\/)(?:\.local|\.git|\.codegraph|node_modules|work|data|user-data|profiles?|sessions?|research|evidence|handoffs?|test-results|playwright-report|coverage)(?:\/|$)/i.test(path)
  || /(?:^|\/)(?:codegraph\.json|\.env(?:\.[^/]*)?|[^/]+\.(?:log|pem|key|p12|pfx|tgz)|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?)$/i.test(path) && !path.endsWith('.env.example')
  || /(?:^|\/)(?:id_rsa|id_ed25519|\.DS_Store|\.npmrc|\.netrc|cookies?\.json|storage-state\.json|.*\.(?:har|trace|session\.jsonl))$/i.test(path);

function checkPath(path, label) {
  if (!path || !allowed.test(path) || path.includes('\\') || path.includes('\0') || isAbsolute(path) || path.split('/').some(part => part === '..' || part === '.') || forbidden(path)) throw Error(`${label}: forbidden public path ${JSON.stringify(path)}`);
}

function checkBytes(bytes, label) {
  if (bytes.includes(0)) return;
  const text = bytes.toString('utf8');
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/,
    /\bsk-(?:proj-|ant-api\d+-)?[A-Za-z0-9_-]{32,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bxox[baprs]-[0-9A-Za-z-]{24,}\b/,
  ];
  if (patterns.some(pattern => pattern.test(text))) throw Error(`${label}: possible credential material; remove it before distribution`);
}

const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
await lstat(join(root, '.git')).catch(() => { throw Error('Public distribution requires this project’s own Git repository; initialize it before packaging'); });
if (await realpath(git(['rev-parse', '--show-toplevel']).trim()) !== await realpath(root)) throw Error('Refusing to audit a parent Git repository');
if (git(['rev-parse', '--is-shallow-repository']).trim() !== 'false') throw Error('Public history audit requires full history and tags (fetch-depth: 0)');
const current = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
const tracked = new Set(git(['ls-files', '--cached', '-z']).split('\0').filter(Boolean));
for (const path of new Set(current)) {
  checkPath(path, 'Git working files');
  const full = join(root, path);
  const stat = await lstat(full);
  if (!stat.isFile() || await realpath(full) !== full) throw Error(`Git working files: non-owned file ${path}`);
  checkBytes(await readFile(full), `Git working file ${path}`);
}
const objects = new Map();
for (const entry of git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
  const match = entry.match(/^(\d+) ([a-f0-9]+) (\d+)\t([\s\S]+)$/);
  if (!match) throw Error('Malformed Git index entry');
  const [, mode, oid, stage, path] = match;
  checkPath(path, 'Git index');
  if (stage !== '0' || !['100644', '100755'].includes(mode)) throw Error(`Git index: unresolved or non-file entry ${path}`);
  objects.set(oid, path);
}
const commits = git(['rev-list', '--all']).trim().split('\n').filter(Boolean);
for (const commit of commits) {
  checkBytes(Buffer.from(git(['cat-file', 'commit', commit])), `Commit ${commit}`);
  for (const entry of git(['ls-tree', '-r', '-z', commit]).split('\0').filter(Boolean)) {
    const match = entry.match(/^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]+)$/);
    if (!match) throw Error(`Malformed Git tree entry in ${commit}`);
    const [, mode, type, oid, path] = match;
    checkPath(path, `History ${commit}`);
    if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw Error(`History ${commit}: non-file public entry ${path}`);
    objects.set(oid, path);
  }
}
for (const ref of git(['for-each-ref', '--format=%(refname)', 'refs/tags']).trim().split('\n').filter(Boolean)) {
  const type = git(['cat-file', '-t', ref]).trim();
  if (type === 'tag') checkBytes(Buffer.from(git(['cat-file', 'tag', ref])), `Tag ${ref}`);
  if (git(['cat-file', '-t', `${ref}^{}`]).trim() !== 'commit') throw Error(`Only commit tags may be published: ${ref}`);
}
for (const [oid, path] of objects) checkBytes(execFileSync('git', ['cat-file', 'blob', oid], { cwd: root, maxBuffer: 128 * 1024 * 1024 }), `Historical file ${path}`);

// Inspect the actual compressed archive, independently of npm's file-list report.
// No extraction means a malformed archive cannot write outside the temporary dir.
function inspectTar(compressed) {
  const tar = gunzipSync(compressed), files = new Map();
  const field = (header, start, length) => header.subarray(start, start + length).toString('utf8').split('\0')[0];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const sizeField = field(header, 124, 12).trim();
    if (!/^[0-7]+$/.test(sizeField)) throw Error('Unsupported npm tar size');
    const size = parseInt(sizeField, 8), type = field(header, 156, 1), prefix = field(header, 345, 155);
    const rawPath = (prefix ? prefix + '/' : '') + field(header, 0, 100);
    if (!Number.isSafeInteger(size) || offset + 512 + size > tar.length) throw Error('Truncated npm tar entry');
    if (!rawPath.startsWith('package/')) throw Error(`Unexpected npm archive root: ${rawPath}`);
    const path = rawPath.slice('package/'.length);
    if (type === '5') { checkPath(path.replace(/\/$/, ''), 'Actual npm package'); }
    else {
      if (type !== '' && type !== '0') throw Error(`Non-file npm tar entry: ${rawPath}`);
      checkPath(path, 'Actual npm package');
      if (files.has(path)) throw Error(`Duplicate npm tar entry: ${path}`);
      const bytes = tar.subarray(offset + 512, offset + 512 + size);
      checkBytes(bytes, `Actual npm package ${path}`);
      files.set(path, { size, sha256: sha256(bytes), bytes });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const scratch = resolve(root, '../.local');
await mkdir(scratch, { recursive: true });
const temporary = await mkdtemp(join(scratch, 'response-id-public-'));
try {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }));
  if (packed.length !== 1) throw Error('Expected exactly one npm archive');
  const archive = resolve(temporary, packed[0].filename);
  if (!archive.startsWith(temporary + '/')) throw Error('Unexpected npm archive path');
  const bytes = await readFile(archive), files = inspectTar(bytes);
  for (const file of packed[0].files) if (files.get(file.path)?.size !== file.size) throw Error(`npm tar inventory mismatch: ${file.path}`);
  if (packed[0].files.length !== files.size) throw Error('npm tar inventory count mismatch');
  for (const [path, file] of files) {
    // lib/ is build output generated by prepack; every other packaged file must be tracked.
    if (!tracked.has(path) && !path.startsWith('lib/')) throw Error(`Distribution file is missing from the Git index: ${path}`);
    const source = await readFile(join(root, path));
    const same = path === 'package.json'
      ? JSON.stringify(JSON.parse(source)) === JSON.stringify(JSON.parse(file.bytes))
      : sha256(source) === file.sha256;
    if (!same) throw Error(`Actual npm package differs from source: ${path}`);
  }
  for (const path of ['package.json', 'src/index.mjs', 'src/engine.mjs', 'src/shared.mjs', 'cordis.patch.yml', 'LICENSE']) if (!files.has(path)) throw Error(`Missing runtime file in npm package: ${path}`);
  console.log(`Public files, full history/tags and actual npm archive passed (${current.length} working files, ${commits.length} commits, ${files.size} package files; SHA256 ${sha256(bytes)}).`);
} finally { await rm(temporary, { recursive: true, force: true }); }
