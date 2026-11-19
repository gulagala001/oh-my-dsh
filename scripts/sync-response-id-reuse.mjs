import { syncVendorPlugin } from './sync-vendor-plugin.mjs';

await syncVendorPlugin({
  id: 'response-id-reuse', repository: 'dsh-response-id-reuse', name: '@gulagala001/dsh-response-id-reuse',
  required: ['src/engine.mjs', 'src/shared.mjs', 'docs/structure.json'], revision: 'clean',
});
