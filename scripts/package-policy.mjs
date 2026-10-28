// Runtime archives omit website media and maintainer-only tools. Source and
// published documentation retain them; vendored runtime snapshots stay whole.
export function assertPackageScope(paths) {
  const excluded = /^(?:docs\/images\/|docs\/index(?:_EN)?\.html$|docs\/site\/.*\.(?:css|js)$|scripts\/(?:deepswe\/|tool-performance\/|build-docs\.mjs$|plugin-submissions\.mjs$)|euler-neon-fluid\.html$)/;
  const unexpected = paths.filter(path => excluded.test(path));
  if (unexpected.length) throw new Error('Non-runtime files in OMD package: ' + unexpected.join(', '));
}
