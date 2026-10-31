import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const catalogRepository = 'awesome-dsh-plugin/awesome-dsh-plugin';
export const catalogUrl = 'https://awesome-dsh-plugin.com/plugins.json';
export const guidelines = `https://github.com/${catalogRepository}/blob/main/contributing.md`;

export function releaseTarget(pkg) {
  const repository = (pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/^https:\/\/github.com\//, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[\w.-]+$/.test(pkg.name)
    || !/^[\w.+-]+$/.test(pkg.version) || typeof pkg.engines?.dsh !== 'string') throw Error('Invalid package release identity');
  const tag = 'v' + pkg.version, filename = `${pkg.name}-${pkg.version}.tgz`;
  return { repository, version: pkg.version, hostVersion: pkg.engines.dsh, tag, filename,
    url: `https://github.com/${repository}/releases/download/${tag}/${filename}`,
    entryPath: `data/plugins/${repository.replace('/', '__')}.yml` };
}

function scalar(source, key) {
  const lines = [...source.matchAll(new RegExp(`^${key}:([ \\t]*)([^\\r\\n]+)$`, 'gm'))];
  if (lines.length !== 1) throw Error(`Expected one top-level ${key} in the catalog entry`);
  const raw = lines[0][2].trim();
  const value = raw.startsWith('"') ? JSON.parse(raw) : raw.startsWith("'") && raw.endsWith("'") ? raw.slice(1, -1).replaceAll("''", "'") : raw;
  if (typeof value !== 'string' || !value.startsWith('https://') || /\s/.test(value)) throw Error(`Invalid ${key} URL`);
  return { value, raw, line: lines[0][0] };
}

export function catalogEntry(source, target) {
  if (scalar(source, 'url').value !== `https://github.com/${target.repository}`) throw Error('Catalog entry belongs to another repository');
  const tarball = scalar(source, 'tarball');
  const parsed = new URL(tarball.value);
  if (parsed.origin !== 'https://github.com' || parsed.search || parsed.hash
    || !parsed.pathname.startsWith(`/${target.repository}/releases/download/`)
    || parsed.pathname.split('/').length !== 7 || !parsed.pathname.endsWith('.tgz')) throw Error('Catalog must name a fixed release asset in this repository');
  return { tarball: tarball.value, proposedEntry: source.replace(tarball.line, `tarball: ${target.url}`),
    metadataUrl: new URL('metadata.json', parsed).href };
}

export function marketState({ target, entry, previousHost, liveEntry, pending = [], catalogAvailable = true }) {
  if (entry.tarball !== target.url) {
    if (previousHost !== target.hostVersion) return 'needs-host-review';
    return pending.length ? 'awaiting-review' : 'needs-entry-update';
  }
  if (!catalogAvailable) return 'catalog-unavailable';
  return liveEntry?.tarball === target.url ? 'installation-synced' : 'awaiting-catalog';
}

export async function inspectMarketRelease(pkg, { json, text, now = () => new Date().toISOString() }) {
  const target = releaseTarget(pkg), api = `https://api.github.com/repos/${target.repository}`;
  const release = await json(`${api}/releases/tags/${encodeURIComponent(target.tag)}`);
  if (release.draft || release.prerelease || release.tag_name !== target.tag) throw Error('The exact release is not public and stable');
  const archive = release.assets?.find(asset => asset.name === target.filename);
  if (archive?.state !== 'uploaded' || archive.browser_download_url !== target.url) throw Error('The fixed install asset is not available');
  const metadata = await json(new URL('metadata.json', target.url).href);
  if (metadata.schema !== 1 || metadata.name !== pkg.name || metadata.version !== target.version
    || metadata.hostVersion !== target.hostVersion || metadata.file !== target.filename || metadata.filename !== target.filename
    || !/^[a-f0-9]{40}$/.test(metadata.sourceCommit ?? '') || !/^[a-f0-9]{64}$/.test(metadata.sha256 ?? '')
    || archive.digest !== 'sha256:' + metadata.sha256) throw Error('Release metadata, exact host and asset digest do not agree');
  const entrySource = await text(`https://raw.githubusercontent.com/${catalogRepository}/main/${target.entryPath}`);
  const entry = catalogEntry(entrySource, target);
  let previousHost = target.hostVersion;
  if (entry.tarball !== target.url) {
    try { previousHost = (await json(entry.metadataUrl)).hostVersion ?? null; }
    catch { previousHost = null; }
  }
  let catalog = null, catalogError = null;
  try {
    catalog = await json(catalogUrl);
    if (!Array.isArray(catalog.plugins)) throw Error('Invalid published catalog');
  } catch (error) { catalogError = error.message; }
  const pending = [];
  if (entry.tarball !== target.url && previousHost === target.hostVersion) {
    const query = `repo:${catalogRepository} is:pull-request is:open "${pkg.name}"`;
    const search = await json(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&per_page=100`);
    if (!Array.isArray(search.items) || search.incomplete_results || !Number.isSafeInteger(search.total_count)
      || search.total_count !== search.items.length || search.total_count > 100) throw Error('Cannot establish existing market pull requests completely');
    for (const item of search.items) {
      const pr = await json(`https://api.github.com/repos/${catalogRepository}/pulls/${item.number}`);
      if (!/^[\w.-]+\/[\w.-]+$/.test(pr.head?.repo?.full_name ?? '') || !/^[a-f0-9]{40}$/.test(pr.head?.sha ?? '')) throw Error('Invalid pull request source');
      try {
        const proposed = await text(`https://raw.githubusercontent.com/${pr.head.repo.full_name}/${pr.head.sha}/${target.entryPath}`);
        if (catalogEntry(proposed, target).tarball === target.url) pending.push({ number: item.number, url: item.html_url, head: pr.head.ref, repository: pr.head.repo.full_name });
      } catch (error) {
        // A missing file is an unrelated proposal, not an update to this entry.
        if (error.status !== 404) throw error;
      }
    }
  }
  const liveEntry = catalog?.plugins?.find(plugin => plugin.url === `https://github.com/${target.repository}`) ?? null;
  const status = marketState({ target, entry, previousHost, liveEntry, pending, catalogAvailable: catalogError === null });
  return { schema: 1, checkedAt: now(), status, release: release.html_url, target,
    entry: { url: `https://github.com/${catalogRepository}/blob/main/${target.entryPath}`, tarball: entry.tarball, hostVersion: previousHost },
    catalog: { url: catalogUrl, updated: catalog?.updated ?? null, tarball: liveEntry?.tarball ?? null, version: liveEntry?.version ?? null, error: catalogError },
    pending, guidelines, proposedEntry: previousHost === target.hostVersion ? entry.proposedEntry : null };
}

async function readPublic(url) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (new URL(url).origin === 'https://api.github.com' && process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Object.assign(Error(`HTTP ${response.status}: ${url}`), { status: response.status });
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 16 * 1024 * 1024) throw Error('Public release/catalog response exceeds 16 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--output')) throw Error('Usage: check-market-release.mjs [--output DIRECTORY]');
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const result = await inspectMarketRelease(pkg, { text: readPublic, json: async url => JSON.parse(await readPublic(url)) });
  if (args.length) {
    const output = resolve(args[1]); await mkdir(output, { recursive: true });
    await writeFile(resolve(output, 'market-status.json'), JSON.stringify(result, null, 2) + '\n');
    if (result.proposedEntry && result.status === 'needs-entry-update') {
      const path = resolve(output, result.target.entryPath); await mkdir(dirname(path), { recursive: true });
      await writeFile(path, result.proposedEntry);
    }
  }
  const summary = `Market installation: **${result.status}**\n\nRelease: ${result.release}\n\nExact DSH: ${result.target.hostVersion}\n\nCatalog entry: ${result.entry.url}\n\n${result.pending.map(pr => `Existing PR: ${pr.url}`).join('\n')}\n\nReview the current [contribution rules](${guidelines}) before any external write. No PR or comment is created by this check.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_ACTIONS && result.status !== 'installation-synced') console.log(`::warning::Market installation state: ${result.status}; see the release job summary and market-status.json`);
  console.log(JSON.stringify(result, null, 2));
}
