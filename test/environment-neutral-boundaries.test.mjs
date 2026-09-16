import test from 'node:test';
import assert from 'node:assert/strict';
import { neutralizeHostEnvironment } from '../src/cc-adaptation/environment.mjs';

const assembly = (name, text) => ({ sections: [{ name, text }], contexts: [], tools: [], variables: {} });
test('neutral environment leaves brand-like workspace paths byte-exact', () => {
  const path = '/tmp/The DSH file sandbox/the DSH file sandbox/DSH';
  const text = `Current DSH file policy: workspace-write. Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(path)}. Some platform temporary areas may also be writable.`;
  const a = { sections: [], contexts: [{ name: 'sandbox:policy', text }] };
  const r = neutralizeHostEnvironment(a);
  assert.ok(r.contexts[0].text.startsWith('Current file policy: workspace-write. Any available operation enforced by the file sandbox'));
  assert.ok(r.contexts[0].text.includes(JSON.stringify(path)));
  assert.equal(a.contexts[0].text, text, 'input must not be mutated');
});
test('neutral environment leaves source paths exact even when they contain replaced phrases', () => {
  const path = '/tmp/inspect or extend DSH itself./The DeepSeek Harness implementation checkout';
  const text = `The DeepSeek Harness implementation checkout is at ${path}. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.`;
  const r = neutralizeHostEnvironment(assembly('harness:source', text));
  assert.ok(r.sections[0].text.includes(path));
  assert.ok(r.sections[0].text.startsWith('The host application source checkout'));
  assert.ok(r.sections[0].text.endsWith('inspect or extend the host application itself.'));
  assert.equal(neutralizeHostEnvironment(r), r, 'rewriting is idempotent');
});
test('unowned instructions, custom identities, schemas and variables remain untouched', () => {
  const text = 'You are an AI agent powered by DeepSeek Harness.';
  const userInstructions = { name: 'agent:instructions', text };
  const tools = [{ name: 'run_code', description: 'DSH_*', parameters: { const: 'dsh-preview' } }];
  const variables = { cwd: '/tmp/DSH', DSH_HOME: '/tmp/DeepSeek Harness' };
  const a = { sections: [userInstructions], contexts: [], tools, variables };
  assert.equal(neutralizeHostEnvironment(a), a);
  const b = { ...a, sections: [{ name: 'harness:identity', text }, userInstructions] };
  const r = neutralizeHostEnvironment(b);
  assert.equal(r.sections[0].text, 'You are an AI agent.');
  assert.equal(r.sections[1], userInstructions);
  assert.equal(r.tools, tools);
  assert.equal(r.variables, variables);
  const custom = assembly('harness:identity', 'Custom instruction: ' + text);
  assert.equal(neutralizeHostEnvironment(custom), custom);
});
test('read-only and full-access policy semantics survive neutral wording', () => {
  for (const [before, after] of [
    ['Current DSH file policy: read-only. Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode.', 'Current file policy: read-only. Any available operation enforced by the file sandbox cannot modify files in the standing mode.'],
    ['Current DSH file policy: danger-full-access. The DSH file sandbox does not restrict file modifications by available operations.', 'Current file policy: danger-full-access. The file sandbox does not restrict file modifications by available operations.'],
  ]) {
    assert.equal(neutralizeHostEnvironment(assembly('sandbox:policy', before)).sections[0].text, after);
  }
});
