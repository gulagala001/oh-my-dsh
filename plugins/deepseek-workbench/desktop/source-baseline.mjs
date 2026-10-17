/** Exact public alpha.2 inputs; no version rewriting or installed-application fallback. */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const BASELINE = Object.freeze({
  version: '0.2.1-alpha.2',
  commit: 'd743267388641bc76f17c45ce8b4c231aed1d32c',
  sourceArchiveSha256: '414db357dda081d11d531ea3e9969f48fa0502809ff579396c3c2bbf7e109253',
  sourceTreeSha256: 'c2bbcc20d5b21792b4812a8401af3df9768728dfc4f5b895a0274748ca70f7c1',
  electron: '44.7.0',
  electronArchiveSha256: 'e04e411b58a0a14375dd21b0ab4a378fd38930a702e4e20e322fee4849404c0b',
  typescript: '6.0.3',
  packageManager: 'pnpm@11.28.5',
})
export const HOST_PATHS = Object.freeze([
  'apps/desktop/src/browser-guests.ts', 'apps/desktop/src/preload-browser.ts',
  'apps/desktop/src/ipc.ts', 'apps/desktop/src/main.ts', 'packages/client/ui-sidebar-browser/src/types.ts',
  'apps/desktop/src/preload-app.ts', 'apps/desktop/src/platform-view.ts',
])
const HASHES = Object.freeze({
  'apps/desktop/src/browser-guests.ts': '5911d6bcbce79b68bd951d27da40bf8b8c9ab57b7d715dd0586d5e74e8e515f4',
  'apps/desktop/src/preload-browser.ts': '17c386171796e77f6a2bfa3c86382a20cce36013275beca978f31b424ef25e9e',
  'apps/desktop/src/ipc.ts': 'b7ee202112d7485c524741ffcfe257c5c4f6dca18281aa5ac01c4510b69c6a08',
  'apps/desktop/src/main.ts': '19aae691feeb41e459f2de0c1000f02d6bea02a4b9f5d3c59f3b02b7a628edac',
  'packages/client/ui-sidebar-browser/src/types.ts': '8a5f9a5219091b4bb530edfae282e231cf489945d47813e007a2c8b8584b0f2f',
  'apps/desktop/src/preload-app.ts': 'cff269a4f049d276a44974c3c40008ceb9d6a0b35105a54d6605f7dcf59a64eb',
  'apps/desktop/src/platform-view.ts': '88d582c4b3ff220006f6de4659116dd475a9f77d1f0838c7f92c37f79ffc78b0',
  'package.json': 'c89d8e465b5540df1fd9df63f328df925490a200b7ed657f31665495581683f6',
  'apps/desktop/package.json': 'ae8547bde6dd5c42aebb857c6c583dd3897808754017eb6a9228a3817112b377',
  'apps/cli/package.json': '6ae99480328644257038be83783fc7b86e9c156422e384cdc3a6fdc237f87777',
  'pnpm-lock.yaml': 'b45f8695fb0dca90d3ed07afc766e923356539962706ee36ac8cdb396e6d734d',
  'apps/desktop/tsconfig.host.json': 'f5412d99db4f4a7dee3558e8923e240184c95943a71c21bded3b3371ce92a89f',
  'apps/desktop/tsconfig.client.json': '938484f3adbd521089b1cf3a95a5d605b9fb16a2417f48dd1bea0d87341ac36a',
  'tsconfig.client.json': 'c5266cb97605a2b2233e37383227de36a7434ff9a9f0182cf4dca89f94447acb',
})
export const PATCH_SHA256 = '0d2519d3e7ac8c5d47fde304fbffa5dbf3d00dadd41e93e02ac651c8427eebf9'
export const PATCHED_HASHES = Object.freeze({
  'apps/desktop/src/browser-guests.ts': '634a76510b50a0253d321d492ef222eb251106f5e3be79701cb7019ffe6f7040',
  'apps/desktop/src/preload-browser.ts': '1ca9cf043b6460283a5183679ed5a5a3efcd199cc414bfb672fce7d48339dcfc',
  'apps/desktop/src/ipc.ts': '0725e9c119541aadd21922287f572b1a9de5f3b99474170c5cff495f0b630ec9',
  'apps/desktop/src/main.ts': '9b55c3a922c40aed89ee80be6b8f012f150dec1242b0801482758750379c4ead',
  'packages/client/ui-sidebar-browser/src/types.ts': '18efa7db0d57cf0592176b4d5acc263a9567f36fa94e152a27fd812ace8f43b5',
  'apps/desktop/src/preload-app.ts': '8dc75e35667d75ad940127c76f08c9226df136ae261b7c6c2a2f946d312b2ac9',
  'apps/desktop/src/platform-view.ts': '605c2e8c4fae8b302e25d513764ae5c128f808cad164f56e785cadc9d6898e12',
  'apps/desktop/src/deepseek-browser-policy.ts': '8a1e48cf3b053fd653e06dbf75ec7973c3ce0548598d858851ae3fe947a39067',
  'tsconfig.client.json': '8eae954d8d0e49bb7039bce204f5afc14ffb1f486a2096a81115fa0e4d6de223',
})
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export async function assertPatchBaseline() {
  const bytes = await readFile(new URL('./deepseek-workbench-host.patch', import.meta.url))
  const actual = sha256(bytes)
  if (actual !== PATCH_SHA256) throw new Error(`alpha.2 patch mismatch: actual ${actual}, expected ${PATCH_SHA256}`)
  return actual
}

export async function assertPatchedSource(root) {
  for (const [file, expected] of Object.entries(PATCHED_HASHES)) {
    const actual = sha256(await readFile(join(root, file)))
    if (actual !== expected) throw new Error(`alpha.2 patched source mismatch: ${file}: actual ${actual}, expected ${expected}`)
  }
}

/** Hash source bytes before copying; Git metadata and optional installed dependencies are not source inputs. */
export async function sourceTreeIdentity(root, { dependencies = false } = {}) {
  const files = []
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || dependencies && entry.name === 'node_modules') continue
      const name = prefix + entry.name
      if (entry.isDirectory()) await visit(join(directory, entry.name), name + '/')
      else if (entry.isFile() || entry.isSymbolicLink() && (await stat(join(directory, entry.name))).isFile()) files.push(name)
      else if (!entry.isSymbolicLink()) throw new Error(`alpha.2 source: unexpected nonregular input ${name}`)
    }
  }
  await visit(root)
  const digest = createHash('sha256')
  for (const file of files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))) digest.update(`${file}\0${sha256(await readFile(join(root, file)))}\n`)
  return { files: files.length, sha256: digest.digest('hex') }
}

/** Validate the seven patch inputs and actual manifests/lock/configs, not a caller's version claim. */
export async function assertSourceBaseline(source) {
  const observed = {}
  for (const [file, expected] of Object.entries(HASHES)) {
    const actual = sha256(await readFile(join(source, file)))
    if (actual !== expected) throw new Error(`alpha.2 source mismatch: ${file}: actual ${actual}, expected ${expected} (${BASELINE.commit})`)
    observed[file] = actual
  }
  const tree = await sourceTreeIdentity(source, { dependencies: true })
  if (tree.sha256 !== BASELINE.sourceTreeSha256) throw new Error(`alpha.2 complete source mismatch: actual ${tree.sha256}, expected ${BASELINE.sourceTreeSha256}`)
  const manifests = {}
  for (const file of ['package.json', 'apps/desktop/package.json', 'apps/cli/package.json']) {
    const manifest = JSON.parse(await readFile(join(source, file), 'utf8'))
    if (manifest.version !== BASELINE.version) throw new Error(`alpha.2 manifest mismatch: ${file}: ${manifest.version}`)
    manifests[file] = { name: manifest.name, version: manifest.version }
  }
  return { ...BASELINE, manifests, files: observed, tree }
}

/** Missing real dependencies mean not-run; a mismatched available dependency is a failure. */
export async function nativePrerequisites(source, electronZip) {
  if (!source || !electronZip) return { skip: 'Native alpha.2 not-run: DSH_SOURCE and DSH_ELECTRON_ZIP are required' }
  try { await stat(join(source, 'package.json')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { skip: `Native alpha.2 not-run: source tree missing: ${source}` }
  }
  const identity = await assertSourceBaseline(source)
  const required = ['node_modules/typescript/lib/typescript.js', 'node_modules/typescript/bin/tsc',
    'apps/desktop/node_modules/electron/electron.d.ts', 'node_modules/@types/node/package.json']
  for (const file of required) {
    try { await stat(join(source, file)) }
    catch (error) {
      if (error.code !== 'ENOENT') throw error
      return { skip: `Native alpha.2 not-run: real source dependency missing: ${join(source, file)}; install only in the isolated generation during the concentrated gate` }
    }
  }
  for (const [file, version] of [['node_modules/typescript/package.json', BASELINE.typescript],
    ['apps/desktop/node_modules/electron/package.json', BASELINE.electron]]) {
    const manifest = JSON.parse(await readFile(join(source, file), 'utf8'))
    if (manifest.version !== version) throw new Error(`alpha.2 toolchain mismatch: ${file}: actual ${manifest.version}, expected ${version}`)
  }
  let archive
  try { archive = await readFile(electronZip) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { skip: `Native alpha.2 not-run: Electron archive missing: ${electronZip}` }
  }
  const electronArchiveSha256 = sha256(archive)
  if (electronArchiveSha256 !== BASELINE.electronArchiveSha256) throw new Error(`alpha.2 Electron archive mismatch: actual ${electronArchiveSha256}, expected ${BASELINE.electronArchiveSha256}`)
  return { identity: { ...identity, electronArchiveSha256 } }
}
