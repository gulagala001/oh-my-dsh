// Exercise the real DSH resolver with the plugin outside every node_modules
// directory. Ordinary copied-package integration tests cannot catch this bug.
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { PluginPackages, loadProfileDirectory, createRuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const [runtime, profileDir, source, mode] = process.argv.slice(2)
const manifestPath = source + '/package.json'
const original = await readFile(manifestPath, 'utf8')
const ctx = new Context()
try {
  if (mode === 'missing-peers') {
    const broken = JSON.parse(original)
    delete broken.peerDependencies
    await writeFile(manifestPath, JSON.stringify(broken))
  }
  const installAnchor = runtime + '/node_modules/@deepseek-ai/dsh/package.json'
  const profile = loadProfileDirectory('dsh', profileDir, installAnchor)
  const resolution = await createRuntimeResolution({ installAnchor, profile })
  await ctx.plugin(PluginPackages, { resolution })
  const load = () => import(pathToFileURL(source + '/index.js'))
  if (mode === 'missing-peers') {
    await assert.rejects(load(), error => error.code === 'ERR_MODULE_NOT_FOUND' && /schemastery/.test(error.message))
    console.log('PASS linked installation fixture reproduces missing host peer declarations')
  } else {
    const plugin = await load()
    assert.equal(plugin.name, 'unharnessed')
    assert.equal(typeof plugin.apply, 'function')
    assert.equal(plugin.Config({}).snapshots, true)
    console.log('PASS linked installation resolves all runtime imports through declared host peers')
  }
} finally {
  await writeFile(manifestPath, original)
  await ctx.fiber.dispose()
}
