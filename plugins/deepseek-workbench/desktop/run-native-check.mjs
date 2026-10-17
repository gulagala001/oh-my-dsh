/** Compile actual pinned alpha.2 guest/preload/IPC and run matching Electron in owned temporary storage. */
import { readFile, writeFile, mkdir, copyFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import { BASELINE, HOST_PATHS, nativePrerequisites, assertPatchBaseline, assertPatchedSource } from './source-baseline.mjs'

const [source, electronZip, demoUrl, demoCookieFile, demoStorage] = process.argv.slice(2)
const inputs = await nativePrerequisites(source, electronZip)
if (inputs.skip) {
  console.log(JSON.stringify({ status: 'not-run', reason: inputs.skip }))
} else {
const identity = { ...inputs.identity, patchSha256: await assertPatchBaseline() }
const root = await mkdtemp(join(tmpdir(), 'deepseek-native-check-'))
const runtime = join(root, 'runtime')
const reports = []
try {
  for (const file of [...HOST_PATHS, 'tsconfig.client.json']) {
    await mkdir(join(root, file, '..'), { recursive: true }); await copyFile(join(source, file), join(root, file))
  }
  const patchFile = fileURLToPath(new URL('./deepseek-workbench-host.patch', import.meta.url))
  for (const args of [['apply', '--check', patchFile], ['apply', patchFile]]) {
    const patch = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    if (patch.error) throw patch.error
    assert.equal(patch.status, 0, patch.stderr)
  }
  await assertPatchedSource(root)
  await mkdir(runtime)
  await mkdir(join(root, 'user-data'))
  await mkdir(join(root, 'session-data'))
  const ts = (await import(pathToFileURL(join(source, 'node_modules/typescript/lib/typescript.js')).href)).default
  function compile(code, commonJS = false) {
    const result = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2024,
      module: commonJS ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext } })
    const errors = (result.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error)
    assert.deepEqual(errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')), [])
    return result.outputText
  }
  const guests = await readFile(join(root, HOST_PATHS[0]), 'utf8')
  await writeFile(join(runtime, 'browser-guests.mjs'), compile(guests).replace("'./deepseek-browser-policy.ts'", "'./deepseek-browser-policy.mjs'").replace("'./ipc.ts'", "'./ipc.mjs'"))
  await writeFile(join(runtime, 'deepseek-browser-policy.mjs'), compile(await readFile(join(root, 'apps/desktop/src/deepseek-browser-policy.ts'), 'utf8')))
  const ipc = await readFile(join(root, 'apps/desktop/src/ipc.ts'), 'utf8')
  await writeFile(join(runtime, 'ipc.mjs'), compile(ipc))
  // Sandboxed preloads cannot require local modules. Inline the entire real IPC module, not invented channels.
  const ipcCjs = `(() => { const exports = {}; ${compile(ipc, true)}; return exports; })()`
  const preload = compile(await readFile(join(root, HOST_PATHS[1]), 'utf8'), true).replace('require("./ipc.ts")', ipcCjs)
  assert.ok(!preload.includes('require("./ipc.ts")'))
  await writeFile(join(runtime, 'preload.cjs'), `${preload}\nrequire('electron').contextBridge.exposeInMainWorld('dshDesktop', { browser: createDesktopBrowserBridge() });\n`)
  await copyFile(new URL('./native-runner.mjs', import.meta.url), join(runtime, 'native-runner.mjs'))
  const archiveVersion = spawnSync('/usr/bin/unzip', ['-p', electronZip, 'version'], { encoding: 'utf8' })
  if (archiveVersion.error) throw archiveVersion.error
  assert.equal(archiveVersion.status, 0, archiveVersion.stderr)
  assert.equal(archiveVersion.stdout.trim(), BASELINE.electron)
  await mkdir(join(root, 'electron'))
  const unzip = spawnSync('/usr/bin/unzip', ['-q', electronZip, '-d', join(root, 'electron')], { encoding: 'utf8' })
  if (unzip.error) throw unzip.error
  assert.equal(unzip.status, 0, unzip.stderr)
  const executable = join(root, 'electron/Electron.app/Contents/MacOS/Electron')
  const scrubbed = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(name)
    && !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(name)))
  const environment = { ...scrubbed, DSW_TEST_ROOT: root, DSW_TEST_IDENTITY: JSON.stringify(identity),
    HOME: join(root, 'home'), TMPDIR: join(root, 'tmp'), npm_config_cache: join(root, 'npm-cache') }
  for (const name of ['home', 'tmp', 'npm-cache']) await mkdir(join(root, name))
  if (demoUrl) {
    await copyFile(new URL('./native-demo.mjs', import.meta.url), join(runtime, 'native-demo.mjs'))
    const child = spawn(executable, [join(runtime, 'native-demo.mjs'), '--password-store=basic', '--use-mock-keychain'], {
      env: { ...environment, DSW_DEMO_URL: demoUrl, ...(demoCookieFile ? { DSW_DEMO_COOKIE_FILE: demoCookieFile } : {}), ...(demoStorage ? { DSW_DEMO_STORAGE: demoStorage } : {}) },
      stdio: ['ignore', 'inherit', 'inherit'],
    })
    console.log(JSON.stringify({ demo: true, identity, pid: child.pid, runtime, origin: new URL(demoUrl).origin, isolatedUserData: join(root, 'user-data') }))
    await new Promise((resolve, reject) => { child.once('close', code => code === 0 ? resolve() : reject(new Error(`Demo exited ${code}`))); child.once('error', reject) })
  } else {
    for (const phase of ['warm', 'cold']) {
      const result = await new Promise(resolve => {
        const child = spawn(executable, [join(runtime, 'native-runner.mjs'), '--password-store=basic', '--use-mock-keychain', '--disable-background-networking'], {
          env: { ...environment, DSW_TEST_PHASE: phase }, stdio: ['ignore', 'pipe', 'pipe'],
        })
        let stdout = '', stderr = ''
        child.stdout.on('data', value => { stdout += value }); child.stderr.on('data', value => { stderr += value })
        const timer = setTimeout(() => child.kill('SIGKILL'), 50_000)
        child.once('error', error => { clearTimeout(timer); resolve({ error: String(error) }) })
        child.once('close', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }) })
      })
      let report
      try { report = JSON.parse(await readFile(join(root, `report-${phase}.json`), 'utf8')) }
      catch (error) { report = { phase, failures: [`No native report: ${error.message}`] } }
      reports.push({ ...report, process: result })
      assert.equal(result.code, 0, JSON.stringify(reports, null, 2))
      assert.deepEqual(report.failures, [])
      assert.deepEqual(report.identity, identity)
    }
    console.log(JSON.stringify({ status: 'passed', identity, isolated: true, syntheticOrigins: true, reports }, null, 2))
  }
} finally {
  // root is the fresh mkdtemp directory, never an input source, archive or installed application.
  await rm(root, { recursive: true, force: true })
}
}
