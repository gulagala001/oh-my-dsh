import { syncVendorPlugin } from './sync-vendor-plugin.mjs';

await syncVendorPlugin({
  id: 'btw', repository: 'dsh-btw-plugin', name: '@gulagala001/dsh-btw',
  required: ['src/client/index.jsx', 'lib/client.js'], revision: 'head',
});
