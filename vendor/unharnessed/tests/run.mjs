// Uses an existing DSH runtime; never installs or modifies it.
import { mkdtemp, readdir, symlink, cp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const runtime = process.env.DSH_TEST_RUNTIME
if (!runtime) throw new Error('Set DSH_TEST_RUNTIME to an existing, unpacked DSH runtime directory containing node_modules. No installation is performed.')
const modules = join(resolve(runtime), 'node_modules')
const version = JSON.parse(await readFile(join(modules, '@deepseek-ai/dsh/package.json'), 'utf8')).version
console.log(`Using existing DSH ${version}; no package installation`)
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await mkdtemp(join(tmpdir(), 'dsh-unharnessed-test-'))
const linked = await mkdtemp(join(tmpdir(), 'dsh-unharnessed-linked-'))
try {
  const staged = join(root, 'node_modules')
  await cp(source, join(staged, 'dsh-unharnessed'), { recursive: true, filter: path => !path.includes('/node_modules/') && !path.endsWith('/node_modules') })
  for (const entry of await readdir(modules)) {
    if (entry === 'dsh-unharnessed' || entry === '.bin' || entry.startsWith('.')) continue
    await symlink(join(modules, entry), join(staged, entry), 'junction')
  }
  for (const suite of ['notifications', 'integration']) await cp(join(source, `tests/${suite}.mjs`), join(root, `${suite}.mjs`))
  await cp(source, linked, { recursive: true, filter: path => !path.includes('/node_modules/') && !path.endsWith('/node_modules') })
  const profile = join(root, 'profiles', 'linked-fixture')
  await mkdir(join(profile, 'node_modules'), { recursive: true })
  await symlink(linked, join(profile, 'node_modules', 'dsh-unharnessed'), 'junction')
  await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'dsh-linked-fixture', private: true, dependencies: { 'dsh-unharnessed': `link:${linked}` }, dsh: { profile: { bundles: ['dsh-unharnessed'] } } }))
  await cp(join(source, 'tests/linked-install.mjs'), join(root, 'linked-install.mjs'))
  for (const mode of ['missing-peers', 'declared-peers']) {
    const code = await new Promise((resolveCode, reject) => {
      const child = spawn(process.execPath, ['--expose-internals', join(root, 'linked-install.mjs'), resolve(runtime), profile, linked, mode], { cwd: root, env: { ...process.env, DSH_HOME: join(root, 'home') }, stdio: 'inherit' })
      child.once('error', reject)
      child.once('exit', code => resolveCode(code ?? 1))
    })
    if (code !== 0) throw new Error(`Linked installation regression failed: ${mode}`)
  }
  const suites = process.env.DSH_TEST_SUITE ? [process.env.DSH_TEST_SUITE] : ['notifications', 'integration']
  for (const suite of suites) {
  if (!['notifications', 'integration'].includes(suite)) throw new Error('Unknown test suite')
  const code = await new Promise((resolveCode, reject) => {
    const child = spawn(process.execPath, [join(root, `${suite}.mjs`)], { cwd: root, env: { ...process.env, DSH_UNHARNESSED_STATE_DIR: join(root, 'state'), DSH_HOME: join(root, 'home') }, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', code => resolveCode(code ?? 1))
  })
  process.exitCode = code
  if (code !== 0) break
  }
} finally { await rm(root, { recursive: true, force: true }); await rm(linked, { recursive: true, force: true }) }
