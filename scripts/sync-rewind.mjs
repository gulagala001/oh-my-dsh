import { syncVendorPlugin } from './sync-vendor-plugin.mjs';

await syncVendorPlugin({
  id: 'rewind', repository: 'rewind', name: '@gulagala001/dsh-undo-plugin',
  required: ['src/client/index.jsx', 'lib/client.js', 'THIRD_PARTY_NOTICES.md'],
});
