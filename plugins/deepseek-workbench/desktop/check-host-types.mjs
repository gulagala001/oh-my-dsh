/** Compile both actual desktop faces and their references against the pinned real alpha.2 toolchain. */
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { BASELINE, assertSourceBaseline, assertPatchBaseline, assertPatchedSource } from './source-baseline.mjs'
import { stageSource } from './stage-source.mjs'

const source = process.argv[2]
if (!source) throw new Error('Usage: node desktop/check-host-types.mjs /path/to/pristine-alpha2-source-with-node_modules')
const identity = await assertSourceBaseline(source)
await assertPatchBaseline()
for (const [file, version] of [['node_modules/typescript/package.json', BASELINE.typescript],
  ['apps/desktop/node_modules/electron/package.json', BASELINE.electron]]) {
  const manifest = JSON.parse(await readFile(join(source, file), 'utf8'))
  if (manifest.version !== version) throw new Error(`alpha.2 compiler input mismatch: ${file}: ${manifest.version}, expected ${version}`)
}
await readFile(join(source, 'apps/desktop/node_modules/electron/electron.d.ts'))
const root = await mkdtemp(join(tmpdir(), 'deepseek-host-types-'))
try {
  const staged = join(root, 'source')
  await stageSource(source, staged, { dependencies: true })
  const patch = fileURLToPath(new URL('./deepseek-workbench-host.patch', import.meta.url))
  for (const args of [['apply', '--check', patch], ['apply', patch]]) {
    const applied = spawnSync('git', args, { cwd: staged, encoding: 'utf8' })
    if (applied.error) throw applied.error
    if (applied.status !== 0) throw new Error(applied.stderr)
  }
  await assertPatchedSource(staged)
  // Official solution includes host and client faces, all desktop modules, real IPC/types and nominal brands.
  const result = spawnSync(process.execPath, [join(source, 'node_modules/typescript/bin/tsc'),
    '-b', 'apps/desktop/tsconfig.json', '--force'], { cwd: staged, encoding: 'utf8' })
  process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '')
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Complete patched alpha.2 desktop typecheck failed (${result.status ?? result.signal})`)
  console.log(JSON.stringify({ status: 'passed', scope: 'complete desktop host/client and referenced projects', identity }))
} finally {
  // root is the exact fresh directory allocated above; the supplied source is never removed.
  await rm(root, { recursive: true, force: true })
}
