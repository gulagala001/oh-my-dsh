// Runtime archives omit website media and maintainer-only tools. Source and
// published documentation retain them; vendored runtime snapshots stay whole.
import { documentLinks, visibleMarkdown } from './documentation-links.mjs';

export const isRuntimeExcluded = path => /^(?:docs\/images\/|docs\/index(?:_EN)?\.html$|docs\/site\/.*\.(?:css|js)$|scripts\/(?:deepswe\/|tool-performance\/|simulator\/|simulate\.mjs$|build-docs\.mjs$|plugin-submissions\.mjs$)|euler-neon-fluid\.html$)/.test(path);

export function assertPackageScope(paths) {
  const unexpected = paths.filter(isRuntimeExcluded);
  if (unexpected.length) throw new Error('Non-runtime files in OMD package: ' + unexpected.join(', '));
}

export function assertPackageEntrypoints(paths, pkg) {
  const targets = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : [];
  const required = ['package.json', 'LICENSE', ...targets(pkg.main), ...targets(pkg.exports), ...targets(pkg.dsh?.bundle?.patch)];
  for (const target of new Set(required)) {
    const path = target.replace(/^\.\//, '');
    if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..')) throw Error('Invalid package entrypoint: ' + target);
    const pattern = new RegExp('^' + path.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+') + '$');
    if (!paths.some(file => pattern.test(file))) throw Error('Missing package entrypoint: ' + target);
  }
}

// Verify the files users actually receive. Source-tree link checks alone
// cannot catch an npm exclusion that leaves a packaged guide pointing nowhere.
export function assertPackageDocumentation(paths, read) {
  const files = new Set(paths), failures = [];
  for (const file of paths) {
    if (!/\.md$/i.test(file) || /^(?:vendor|plugins|src)\//.test(file)) continue;
    for (const target of documentLinks(visibleMarkdown(read(file).toString('utf8')))) {
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue;
      const path = decodeURIComponent(new URL(target, `https://docs.invalid/${file}`).pathname).slice(1);
      if (!files.has(path) && !paths.some(name => name.startsWith(path.replace(/\/$/, '') + '/'))) failures.push(`${file} -> ${target}`);
    }
  }
  if (failures.length) throw Error('Missing packaged documentation targets: ' + failures.join(', '));
}
