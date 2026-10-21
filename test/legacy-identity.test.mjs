import test from 'node:test';
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEGACY_ID, LEGACY_PACKAGE, OMD_ID, isOmdPreset } from '../src/legacy-identity.mjs';
import { sourceName } from '../src/message-source.mjs';
import { migrateLegacyDataDirectory, migrateLegacyProfilePatches } from '../src/legacy-migration.mjs';

const home = t => { const dir = mkdtempSync(join(tmpdir(), 'omd-identity-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; };

test('earlier session sources and presets read as OMD', () => {
  assert.equal(sourceName({ kind: `plugin:${LEGACY_ID}:trace` }), `${OMD_ID}:trace`);
  assert.equal(sourceName({ kind: 'plugin', plugin: `${LEGACY_ID}:shadow` }), `${OMD_ID}:shadow`);
  assert.equal(sourceName({ kind: `plugin:${OMD_ID}:tasks` }), `${OMD_ID}:tasks`);
  assert(isOmdPreset(LEGACY_ID) && isOmdPreset(OMD_ID) && isOmdPreset('omd-ptc') && !isOmdPreset('standard'));
});

test('data directory moves once and keeps the earlier path resolvable', t => {
  const root = home(t), legacy = join(root, LEGACY_ID);
  mkdirSync(join(legacy, 'context-v1'), { recursive: true });
  writeFileSync(join(legacy, 'context-v1', 'archive.json'), 'kept');
  const current = migrateLegacyDataDirectory(root);
  assert.equal(current, join(root, OMD_ID));
  assert.equal(readFileSync(join(current, 'context-v1', 'archive.json'), 'utf8'), 'kept');
  assert(lstatSync(legacy).isSymbolicLink());
  if (process.platform !== 'win32') assert.equal(readlinkSync(legacy), OMD_ID);
  assert.equal(readFileSync(join(legacy, 'context-v1', 'archive.json'), 'utf8'), 'kept');
  assert.equal(migrateLegacyDataDirectory(root), current);
  assert.equal(realpathSync(legacy), realpathSync(current));
});

test('an existing current directory is never overwritten', t => {
  const root = home(t);
  mkdirSync(join(root, LEGACY_ID)); mkdirSync(join(root, OMD_ID));
  assert.equal(migrateLegacyDataDirectory(root, { warn() {} }), join(root, OMD_ID));
  assert(lstatSync(join(root, LEGACY_ID)).isDirectory());
});

test('profile rows, module names, default preset and settings receipt follow the rename', t => {
  const root = home(t), dir = join(root, 'profiles', 'desktop'), patchPath = join(dir, 'cordis.patch.yml');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `.${LEGACY_ID}-settings-v4.json`), '{"imported":[]}\n');
  writeFileSync(patchPath, [
    '# user patch',
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      custom-main:',
    '        name: Custom',
    `- id: ${LEGACY_ID}`,
    '  config:',
    '    traceEnabled: true',
    '    workspaceRoot: !!js process.cwd()',
    '- id: omd-ui-chat',
    `  name: ${LEGACY_PACKAGE}/host/ui-chat`,
    '  config:',
    '    transcriptView: standard',
    '- id: agent-preset-registry',
    '  config:',
    `    default: ${LEGACY_ID}`,
    `    selectedDefault: ${LEGACY_ID}`,
    '',
  ].join('\n'), { mode: 0o600 });
  const result = migrateLegacyProfilePatches({ dir, patchPath }, root);
  const text = readFileSync(patchPath, 'utf8');
  assert.equal(result.changed, true);
  assert.equal(result.config.traceEnabled, true);
  assert(!text.includes(LEGACY_ID) && !text.includes(LEGACY_PACKAGE), text);
  assert.match(text, new RegExp(`- id: ${OMD_ID}\\n  config:\\n    traceEnabled: true\\n    workspaceRoot: !!js process.cwd\\(\\)`));
  assert.match(text, new RegExp(`name: ${OMD_ID}/host/ui-chat`));
  assert.match(text, new RegExp(`default: ${OMD_ID}\\n    selectedDefault: ${OMD_ID}`));
  assert.match(text, /# user patch\n- id: llm-pi-ai/);
  assert.equal(lstatSync(patchPath).mode & 0o777, 0o600);
  assert.equal(readFileSync(join(dir, `.${OMD_ID}-settings-v4.json`), 'utf8'), '{"imported":[]}\n');
  assert.equal(migrateLegacyProfilePatches({ dir, patchPath }, root).changed, false);
});
