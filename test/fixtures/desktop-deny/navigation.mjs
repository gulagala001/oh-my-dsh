import assert from 'node:assert/strict';
import { appName } from './protocol.mjs';

const titleFor = name => `允许 OpenCU 使用 ${name}？`;

function assertViewportBounds(bounds, viewport, label) {
  assert(bounds && viewport, label + ' has actual bounds and viewport');
  for (const key of ['x', 'y', 'width', 'height']) assert(Number.isFinite(bounds[key]), label + ' finite ' + key);
  assert(Number.isFinite(viewport.width) && viewport.width > 0 && Number.isFinite(viewport.height) && viewport.height > 0);
  assert(bounds.width > 0 && bounds.height > 0 && bounds.x >= 0 && bounds.y >= 0
    && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height,
  label + ' fits the visible viewport without scrolling');
}

export function assertDefaultApprovalEvidence(value, { sessionId, requestId, appDisplayName }) {
  assert.equal(value.sessionId, sessionId); assert.equal(value.boundSessionId, sessionId);
  assert.equal(value.requestId, requestId); assert.equal(value.appDisplayName, appDisplayName);
  assert.equal(value.title, titleFor(appDisplayName));
  assert.equal(value.cardCount, 1, 'Exactly one real approval surface, including hidden duplicates');
  assert.equal(value.matchingCardCount, 1, 'The unique card belongs to the pending application');
  assert.equal(value.titleCount, 1); assert.equal(value.defaultApprovalVisible, true);
  assert.equal(value.denyCount, 1); assert.equal(value.denyVisible, true);
  assertViewportBounds(value.bounds, value.viewport, 'Default approval card');
  assertViewportBounds(value.denyBounds, value.viewport, 'Real Deny action');
}

// Read-only default-card inspection. No group toggle, scrollIntoView, DOM
// mutation or approval API is available here; only the caller clicks real Deny.
export async function defaultApprovalCard(page, { sessionId, pending, beforeObservation, afterObservation }) {
  assert.equal(pending.conversationId, sessionId); assert.equal(pending.request.appDisplayName, appName);
  assert.equal(typeof pending.id, 'string'); assert(pending.id.length > 0);
  const expected = { sessionId, requestId: pending.id, appDisplayName: pending.request.appDisplayName };
  const surfaces = page.locator('[data-codex-approval-surface]');
  const card = surfaces.filter({ hasText: expected.appDisplayName });
  const title = card.getByText(titleFor(expected.appDisplayName), { exact: true });
  const deny = card.getByRole('button', { name: /^(?:拒绝|Deny)(?:\s.*)?$/ });
  const inspect = async () => {
    const selected = await page.evaluate(async () => {
      const value = await window.__OMD_DESKTOP_HOST_BOOT__();
      return { sessionId: value.navigation.sessionId, boundSessionId: value.navigation.boundSessionId,
        viewport: { width: window.innerWidth, height: window.innerHeight } };
    });
    const value = { ...selected, requestId: pending.id, appDisplayName: expected.appDisplayName,
      title: await title.innerText(), titleCount: await title.count(),
      cardCount: await surfaces.count(), matchingCardCount: await card.count(),
      defaultApprovalVisible: await card.isVisible(), bounds: await card.boundingBox(),
      denyCount: await deny.count(), denyVisible: await deny.isVisible(), denyBounds: await deny.boundingBox() };
    assertDefaultApprovalEvidence(value, expected); return value;
  };
  await beforeObservation();
  await card.waitFor({ state: 'attached' });
  const beforeCard = await inspect();
  await afterObservation(beforeCard);
  const afterCard = await inspect();
  return { card, evidence: { beforeCard, afterCard, manualGroupExpansion: false, scrolledIntoView: false, apiApproval: false } };
}
