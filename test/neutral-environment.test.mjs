import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { neutralizeHostEnvironment } from '../src/cc-adaptation/environment.mjs';
import { buildMainPrompt, promptText } from '../src/cc-adaptation/texts.mjs';

const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const assembly = (sections = [], contexts = []) => ({ sections, contexts,
  tools: [{ name: 'run_code', description: 'Native runtime', parameters: { enum: ['dsh-preview'] } }],
  variables: { cwd: '/fixture/DeepSeek Harness', DSH_HOME: '/fixture/.dsh' } });

test('owned source orientation is neutral while real paths and scope rules stay exact', () => {
  const text = 'The DeepSeek Harness implementation checkout is at /fixture/DeepSeek Harness. The checkout location and current working directory are separate values and may differ; never infer the working directory from this path. Use pwd to determine the current working directory. Use this checkout only to inspect or extend DSH itself.';
  const input = freeze(assembly([{ name: 'harness:source', text }]));
  const result = neutralizeHostEnvironment(input);
  assert.equal(result.sections[0].text, text.replace('The DeepSeek Harness implementation checkout', 'The host application source checkout').replace('inspect or extend DSH itself.', 'inspect or extend the host application itself.'));
  assert.equal(result.variables, input.variables); assert.equal(result.tools, input.tools);
  assert.equal(neutralizeHostEnvironment(result), result);
});

test('GUI orientation keeps rebuild, permission and no-replacement-server requirements', () => {
  const prefix = 'You are interacting with the user through the DeepSeek Harness Web GUI at http://127.0.0.1:3083. ';
  const boot = 'The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__.';
  const tail = ' Verify `pnpm run dev:web`. Starting another server does not update this GUI. Do not start a replacement server unless the user asks.';
  const result = neutralizeHostEnvironment(assembly([{ name: 'app:web-surface', text: prefix + boot + tail }]));
  const actual = result.sections[0].text;
  assert.match(actual, /current web interface at http:\/\/127\.0\.0\.1:3083/);
  assert.match(actual, /not a standalone application/); assert.match(actual, /existing host process/);
  assert.ok(actual.endsWith(tail)); assert.doesNotMatch(actual, /DeepSeek Harness|only dsh web/);
});

test('native sandbox wording is neutral while every permission and path stays exact', () => {
  const root = '/fixture/The DSH file sandbox/DeepSeek Harness/.dsh';
  const samples = [
    ['read-only', 'Any available operation enforced by the DSH file sandbox cannot modify files in the standing mode. Do not refuse a required modification from this policy alone: try an available tool normally and follow any denial and escalation guidance it returns.'],
    ['workspace-write', `Any available operation enforced by the DSH file sandbox may modify files under the session workspace: ${JSON.stringify(root)}. Some platform temporary areas may also be writable.`],
    ['danger-full-access', 'The DSH file sandbox does not restrict file modifications by available operations.'],
  ];
  for (const [mode, body] of samples) {
    const text = `Current DSH file policy: ${mode}. ${body}`;
    const input = freeze(assembly([], [{ name: 'sandbox:policy', text }]));
    const result = neutralizeHostEnvironment(input);
    const expected = `Current file policy: ${mode}. ` + body.replace(/^(Any available operation enforced by the|The) DSH file sandbox/, '$1 file sandbox');
    assert.equal(result.contexts[0].text, expected);
    if (mode === 'workspace-write') assert.ok(result.contexts[0].text.includes(JSON.stringify(root)));
    assert.equal(result.tools, input.tools); assert.equal(result.variables, input.variables);
    assert.equal(neutralizeHostEnvironment(result), result);
  }
});

test('project instructions, skills, custom identities and other input are never filtered', () => {
  const text = 'DeepSeek Harness; DSH preview; Need to inspect dsh web and window.__DSH_BOOT__.';
  const input = freeze(assembly(['agent-instructions', 'skills', 'trisoul-x:persona', 'tools:sdk'].map(name => ({ name, text })), [{ name: 'external', text }]));
  assert.equal(neutralizeHostEnvironment(input), input);
  assert.ok(buildMainPrompt(text).startsWith(text));
});

test('default main and mirror are neutral while the actual environment key remains available', () => {
  assert.doesNotMatch(buildMainPrompt(), /TriSoulX conversation interface|DeepSeek Harness/);
  assert.match(promptText('main/02-harness.md'), /## Environment/);
  assert.match(promptText('tools/pwsh.md'), /\$env:DSH_\*/);
  assert.match(promptText('tools/pwsh.md'), /do not bypass it/);
  assert.doesNotMatch(promptText('context/host-gui.md'), /DeepSeek Harness|`dsh web`/);
  assert.doesNotMatch(promptText('context/harness-source.md'), /DeepSeek Harness|extend DSH/);
  assert.equal(readFileSync(new URL('../src/cc-adaptation/identity.mjs', import.meta.url), 'utf8').includes('You are ZCode.'), true);
});
