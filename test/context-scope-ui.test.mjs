import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { until } from './fixtures/frontend.mjs';

async function fixture(t, handle) {
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { createContextUI } from './src/client/context-client.mjs';
    const { ScopeChip } = createContextUI(React);
    function App() {
      const [props, set] = React.useState({ sessionId: 'a' });
      window.setScopeProps = value => set(old => ({ ...old, ...value }));
      return <ScopeChip {...props} useSessions={select => select({ byId: { [props.sessionId]: { blank: !props.locked } } })}/>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  `, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, platform: 'browser', format: 'iife' });
  const browser = await chromium.launch({ args: ['--use-mock-keychain', '--password-store=basic'] });
  t.after(() => browser.close());
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('http://omd.test/', route => route.fulfill({ contentType: 'text/html', body: '<main id="root"></main>' }));
  await page.route('**/trisoul-x/api/scope?*', handle);
  await page.goto('http://omd.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const select = page.getByRole('combobox', { name: '会话范围', exact: true });
  await until(() => select.isEnabled());
  return { page, select, errors };
}

test('late scope reads cannot revert a successfully saved selection', async t => {
  let reads = 0, late;
  const { page, select, errors } = await fixture(t, route => {
    if (route.request().method() === 'POST') return route.fulfill({ json: { scope: 'project', locked: false } });
    if (++reads === 2) { late = route; return; }
    return route.fulfill({ json: { scope: 'session', locked: false } });
  });
  await page.evaluate(() => window.setScopeProps({ locked: true })); await until(() => late);
  await page.evaluate(() => window.setScopeProps({ locked: false })); await until(() => reads === 3);
  await until(() => select.isEnabled()); await select.selectOption('project');
  await until(async () => await select.inputValue() === 'project');
  await late.fulfill({ json: { scope: 'session', locked: false } });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await select.inputValue(), 'project');
  assert.deepEqual(errors, []);
});

test('scope save failures remain explained after refreshing the actual state', async t => {
  let fail = true, reads = 0;
  const { page, select, errors } = await fixture(t, route => {
    if (route.request().method() === 'POST') return route.fulfill(fail
      ? { status: 409, json: { error: '会话范围未保存，请重试' } }
      : { json: { scope: 'project', locked: false } });
    reads++; return route.fulfill({ json: { scope: 'session', locked: false } });
  });
  await select.selectOption('project'); await until(() => reads === 2); await until(() => select.isEnabled());
  assert.match(await page.locator('.cx-scope-chip').getAttribute('title'), /未保存/);
  assert.equal(await select.inputValue(), 'session');
  fail = false; await select.selectOption('project');
  await until(async () => await select.inputValue() === 'project');
  assert.doesNotMatch(await page.locator('.cx-scope-chip').getAttribute('title'), /未保存/);
  assert.deepEqual(errors, []);
});

test('a pending scope write belongs to its original session and does not block the next one', async t => {
  let pending;
  const { page, select, errors } = await fixture(t, route => {
    const id = new URL(route.request().url()).searchParams.get('session');
    if (route.request().method() === 'POST' && id === 'a') { pending = route; return; }
    return route.fulfill({ json: { scope: route.request().method() === 'POST' ? 'project' : 'session', locked: false } });
  });
  await select.selectOption('project'); await until(() => pending);
  await Promise.all([page.waitForResponse(response => response.url().endsWith('?session=b')),
    page.evaluate(() => window.setScopeProps({ sessionId: 'b' }))]);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await select.isEnabled(), true, 'the new session has no pending write');
  await select.selectOption('project'); await until(async () => await select.inputValue() === 'project');
  await pending.fulfill({ json: { scope: 'session', locked: true } });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await select.inputValue(), 'project'); assert.equal(await select.isEnabled(), true);
  assert.deepEqual(errors, []);
});
