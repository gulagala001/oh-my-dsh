import test from 'node:test';
import assert from 'node:assert/strict';
import { handleContextApi } from '../src/context/api.mjs';

test('the retired persona write path rejects mixed patches before writing either store', async () => {
  let writes = 0;
  const hub = { config() { throw Error('must reject before reading or writing'); }, persona: { update() { writes++; } } };
  const ctx = { settings: { update() { writes++; } } };
  await assert.rejects(handleContextApi({ hub, ctx, req: { method: 'POST' }, res: {},
    url: new URL('http://localhost/oh-my-dsh/api/settings'),
    readBody: async () => ({ identityPrompt: 'stale persona', memoryScope: 'session' }), send() { throw Error('unexpected response'); },
  }), /人格设置/);
  assert.equal(writes, 0);
});

test('ordinary OMD settings still use their existing persistence owner', async () => {
  const writes = []; let configured = 0, result;
  const hub = { config: () => ({}), context: { cachedPreparation: { configure() { configured++; } } } };
  await handleContextApi({ hub, ctx: { settings: { async update(...args) { writes.push(args); } } },
    req: { method: 'POST' }, res: {}, url: new URL('http://localhost/oh-my-dsh/api/settings'),
    readBody: async () => ({ memoryScope: 'session' }), send(_res, status, value) { result = { status, value }; },
  });
  assert.deepEqual(writes, [['oh-my-dsh', { memoryScope: 'session' }]]); assert.equal(configured, 1); assert.equal(result.status, 200);
});
