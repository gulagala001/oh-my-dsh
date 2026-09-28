import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdvanced, advancedDefaults, advancedCss } from '../src/client/skins/advanced.mjs';
import { brandDocumentTitle } from '../src/client/document-title.mjs';

test('advanced preferences migrate, bound numbers and reject executable values', () => {
  assert.deepEqual(normalizeAdvanced(), advancedDefaults());
  const value = normalizeAdvanced({ enabled: true, common: { 'body-size': 999, 'line-height': -1, 'panel-blur': Infinity, 'font-ui': 'url(evil)', shadow: 'raised' }, light: { text: '#AABBCC', accent: 'url(https://example.com)', unknown: '#ffffff' }, brand: { logo: 'custom', image: 'data:image/svg+xml,<svg/>', name: '\n工作台\u0000', titleText: 'x'.repeat(80) } });
  assert.deepEqual(value.common, { 'body-size': 24, 'line-height': 1.3, shadow: 'raised' });
  assert.deepEqual(value.light, { text: '#aabbcc' });
  assert.equal(value.brand.image, ''); assert.equal(value.brand.name, '工作台'); assert.equal(value.brand.titleText.length, 60);
  assert.equal(advancedCss(advancedDefaults()), '');
});

test('title switches preserve dynamic host session titles and other owners', () => {
  let current = '当前会话 — DeepSeek Harness';
  const proto = {}; Object.defineProperty(proto, 'title', { configurable: true, get: () => current, set: v => current = v });
  const doc = Object.create(proto), release = brandDocumentTitle(doc);
  release.update({ mode: 'custom', text: '我的 $& 工作台' }); assert.equal(doc.title, '当前会话 — 我的 $& 工作台');
  doc.title = '下个会话 — DeepSeek Harness'; assert.equal(doc.title, '下个会话 — 我的 $& 工作台');
  release.update({ mode: 'native' }); assert.equal(doc.title, '下个会话 — DeepSeek Harness');
  release.update({ mode: 'omd' }); assert.equal(doc.title, '下个会话 — Oh My DSH');
  Object.defineProperty(doc, 'title', { configurable: true, get: () => 'other plugin', set: () => {} });
  release.update({ mode: 'custom', text: 'test' }); release(); assert.equal(doc.title, 'other plugin');
});

test('localized source-build titles preserve the host suffix in native mode and honor explicit branding', () => {
  let current = '会话 — DSH 本地构建', localized = 'DSH 本地构建';
  const proto = {}; Object.defineProperty(proto, 'title', { configurable: true, get: () => current, set: value => current = value });
  const doc = Object.create(proto), release = brandDocumentTitle(doc, { mode: 'custom', text: '桌面定制' }, () => ['DeepSeek Harness', localized]);
  assert.equal(doc.title, '会话 — 桌面定制');
  release.update({ mode: 'native' }); assert.equal(doc.title, '会话 — DSH 本地构建');
  localized = 'DSH Local Build'; doc.title = 'Other session — DSH Local Build';
  release.update({ mode: 'omd' }); assert.equal(doc.title, 'Other session — Oh My DSH');
  doc.title = 'Another title owner'; assert.equal(doc.title, 'Another title owner');
  doc.title = 'Other session — DSH Local Build'; release();
  assert.equal(doc.title, 'Other session — DSH Local Build');
});
