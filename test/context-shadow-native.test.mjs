import test from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '@deepseek-ai/dsh-session';
import { frontendFixture, until } from './fixtures/frontend.mjs';
import { restoreFixtureLog } from './fixtures/restore-log.mjs';

for (const agentPreset of ['trisoul-x', 'standard']) {
  test(`actual provider payload repairs old empty shadows in ${agentPreset}`, { timeout: 60000 }, async t => {
    const requests = [];
    const f = await frontendFixture(t, { headless: true, legacyShadows: true, agentPreset,
      omdConfig: { contextEnabled: false, stateHintsEnabled: false, budgetHintsEnabled: false },
      reply: payload => {
        requests.push(payload);
        return { delta: { role: 'assistant', content: 'Repaired.' }, finish_reason: 'stop' };
      } });
    await until(async () => (await restoreFixtureLog(f.home, f.sessionId)).events
      .filter(e => e.type === 'user/message' && e.data.source?.kind === 'plugin:trisoul-x:shadow').length === 2);
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Resume the old session.' }] });
    await until(() => requests.length === 2);
    const users = requests[1].messages.filter(m => m.role === 'user');
    assert.ok(users.length > 0);
    for (const message of users) {
      assert.ok(typeof message.content === 'string' ? message.content.trim()
        : message.content?.some(b => b.type !== 'text' || b.text?.trim()), JSON.stringify(message));
    }
    assert.match(JSON.stringify(users), /SHADOW_FIXTURE_ORIGINAL/);
    assert.doesNotMatch(JSON.stringify(users), /Archived context segment/);
    assert.equal(requests[1].messages[0].role, 'system');
    const restored = await until(async () => {
      const result = await restoreFixtureLog(f.home, f.sessionId);
      return result.events.filter(e => e.type === 'turn/end').length >= 2 ? result : null;
    });
    const session = Session.create(f.sessionId, restored.events, restored.header);
    assert.equal(restored.events.filter(e => e.type === 'user/message' && e.data.source?.kind === 'plugin:trisoul-x:shadow').length, 2, 'original archive survives');
    assert.ok(!session.deriveMessages().some(m => m.source?.kind === 'plugin:trisoul-x:shadow'), 'durable replay keeps the repair');
    const count = restored.events.filter(e => e.data?.message?.source?.omdShadow).length;
    assert.equal(count, 2);
    await f.rpc('session/prompt', { requestId: crypto.randomUUID(), sessionId: f.sessionId, mode: 'queue', content: [{ type: 'text', text: 'Continue after repair.' }] });
    await until(() => requests.length === 3);
    await until(async () => {
      const result = await restoreFixtureLog(f.home, f.sessionId);
      if (result.events.filter(e => e.type === 'turn/end').length < 3) return false;
      assert.equal(result.events.filter(e => e.data?.message?.source?.omdShadow).length, count, 'repair is idempotent across turns');
      return true;
    });
  });
}
