// One stable adapter per bundle. Rebuilding or reapplying replaces it in place.
export function updateContextClientBundle(bundle, source) {
  const marker = '/* context-v1 client adapter */';
  const footer = 'return module.exports;}});';
  const wrappedFooter = 'return wrapContextClient(module.exports,require);}});';
  const code = source.replace(/^export /gm, '');
  const adapter = `${marker}\n${code}\n${wrappedFooter}`;
  if (bundle.includes(marker)) {
    if (bundle.split(marker).length !== 2 || !bundle.trimEnd().endsWith(wrappedFooter)) throw Error('客户端适配器边界不匹配；未覆盖已有产物。');
    return bundle.slice(0, bundle.indexOf(marker)) + adapter + '\n';
  }
  if (bundle.split(footer).length !== 2 || !bundle.trimEnd().endsWith(footer)) throw Error('未知客户端封装，未改写产物。请先用原仓库构建。');
  return bundle.replace(footer, adapter).trimEnd() + '\n';
}
