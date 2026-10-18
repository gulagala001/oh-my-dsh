import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createJobsOverview, createTeamOverview, createWorkflowOverview } from '../lib/host/overview-native.factory.mjs';

const require = createRequire(import.meta.url);
const hostRequire = name => name === '@deepseek-ai/dsh-client-ui-primitives'
  ? { StateDot: () => null, IconChevronDownOutlineRegular: () => null } : name === '@deepseek-ai/dsh-client-store' ? {} : require(name);

test('native plugin disposal preserves OMD overview styles and repeated factories reuse them', () => {
  const previous = globalThis.document, styles = [];
  globalThis.document = {
    createElement: () => ({ dataset: {} }),
    querySelector: selector => styles.find(style => selector === `style[data-plugin-css=${JSON.stringify(style.dataset.pluginCss)}]`) ?? null,
    head: { appendChild: style => styles.push(style) },
  };
  try {
    const factories = [createJobsOverview, createTeamOverview, createWorkflowOverview];
    factories.forEach(factory => factory(hostRequire));
    assert.equal(styles.length, 3);
    assert.ok(styles.every(style => style.dataset.plugin === 'trisoul_x' && style.dataset.pluginCss.startsWith('trisoul_x/overview/')));
    // The host removes styles by the unloaded module's exact data-plugin ID.
    for (const owner of ['@deepseek-ai/dsh-client-ui-jobs', '@deepseek-ai/dsh-experimental-client-ui-agent-team', '@deepseek-ai/dsh-client-ui-workflow-run']) {
      assert.equal(styles.filter(style => style.dataset.plugin !== owner).length, 3);
    }
    factories.forEach(factory => factory(hostRequire));
    assert.equal(styles.length, 3);
    const jobs = createJobsOverview(hostRequire);
    const job = { id: 'long-command', kind: 'bash', status: 'running', label: 'printf example\n'.repeat(100), startedAt: 1, output: { total: 0 } };
    const t = key => key;
    const html = renderToStaticMarkup(React.createElement(jobs.JobsBody, {
      liveRows: [job], settledRows: [], settledExpanded: false, t,
      item: row => React.createElement(jobs.JobItem, { key: row.id, job: row, expanded: false, now: 1000, t }),
    }));
    assert.ok(html.startsWith(`<ul class="${jobs.styles.menuBody}"`));
    assert.match(html, /aria-label="list.aria"/);
    assert.ok(html.includes(`class="${jobs.styles.sectionHeader}"`));
    assert.ok(html.includes(`class="${jobs.styles.label}"`));
    assert.doesNotMatch(html, /<h3|<section/);
    const css = styles.find(style => style.dataset.pluginCss.includes('/dsh-client-ui-jobs/')).textContent;
    assert.match(css, /white-space:nowrap/);
    assert.match(css, /list-style:none/);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
