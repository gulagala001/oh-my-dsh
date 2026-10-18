import assert from 'node:assert/strict';
import { callId } from './protocol.mjs';

// Normal UI navigation only. The pinned standard layout initially folds this
// process group; revealing it does not repair default approval discoverability.
export async function revealApprovalCard(page, { beforeExpansion, afterExpansion }) {
  const tool = page.locator(`[data-chat-call-id="${callId}"]`);
  await tool.waitFor({ state: 'attached' }); assert.equal(await tool.count(), 1, 'Unique actual tool call');
  const group = page.locator('[data-step-process][data-chat-group-key]').filter({ has: tool });
  assert.equal(await group.count(), 1, 'Unique process group containing the actual call');
  const toggle = group.locator('button.tx-cu-group-toggle[aria-controls]');
  await toggle.waitFor({ state: 'visible' }); assert.equal(await toggle.count(), 1, 'Unique visible normal group toggle');
  const body = group.locator('[data-step-process-body]');
  assert.equal(await body.count(), 1, 'Unique controlled process body');
  const bodyId = await body.getAttribute('id'); assert.equal(typeof bodyId, 'string'); assert(bodyId.length > 0);
  assert.equal(await toggle.getAttribute('aria-controls'), bodyId, 'Toggle controls this exact process body');
  const expanded = await toggle.getAttribute('aria-expanded');
  assert(['false', 'true'].includes(expanded), 'Explicit group expansion state is required');
  const card = tool.locator('[data-codex-approval-surface]');
  await card.waitFor({ state: 'attached' }); assert.equal(await card.count(), 1, 'Unique real approval surface inside the actual tool');
  const evidence = { callId, bodyId, defaultApprovalVisible: await card.isVisible(), manualGroupExpansion: false };
  await beforeExpansion(evidence);
  if (expanded === 'false') { await toggle.click(); evidence.manualGroupExpansion = true; }
  await card.waitFor({ state: 'visible' });
  assert.equal(await tool.count(), 1); assert.equal(await card.count(), 1);
  assert.equal(await body.count(), 1); assert.equal(await body.getAttribute('id'), bodyId);
  assert.equal(await toggle.count(), 1); assert.equal(await toggle.getAttribute('aria-controls'), bodyId);
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', 'Normal navigation expanded the real group');
  await afterExpansion(evidence);
  return { card, evidence };
}
