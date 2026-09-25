import test from 'node:test';
import assert from 'node:assert/strict';
import { brandDocumentTitle } from '../src/client/document-title.mjs';

function fixture() {
  let title = 'DeepSeek Harness'; const writes = [];
  const prototype = {};
  Object.defineProperty(prototype, 'title', { configurable: true,
    get: () => title, set: value => { writes.push(value); title = value; } });
  return { doc: Object.create(prototype), writes };
}

test('title branding writes once, preserves session names and restores the host property', () => {
  const { doc, writes } = fixture(), dispose = brandDocumentTitle(doc);
  for (let i = 0; i < 1000; i++) doc.title = 'DeepSeek Harness';
  assert.deepEqual(writes, ['Oh My DSH']);
  doc.title = '实际会话 — DeepSeek Harness';
  assert.equal(doc.title, '实际会话 — Oh My DSH');
  doc.title = 'DeepSeek Harness project — Other product';
  assert.equal(doc.title, 'DeepSeek Harness project — Other product');
  doc.title = '另一个会话 — DeepSeek Harness'; dispose();
  assert.equal(doc.title, '另一个会话 — DeepSeek Harness');
  assert.equal(Object.hasOwn(doc, 'title'), false);
  const again = brandDocumentTitle(doc);
  assert.equal(doc.title, '另一个会话 — Oh My DSH'); again();
});
