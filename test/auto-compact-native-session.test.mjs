import test from 'node:test';
import { nativeCompactionFixture } from './fixtures/auto-compact-native.mjs';

for (const [nodes, records] of [[40, 4], [300, 30]]) {
  test(`Auto Compact completes ${records} prepared records on ${nodes} real SDK events and preserves recovery`, async () => {
    const fixture = await nativeCompactionFixture({ nodes, records });
    try { await fixture.run(); } finally { await fixture.close(); }
  });
}
