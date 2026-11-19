import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packageFiles } from './check-opencu-delivery.mjs';
import { publicationChanges } from './desktop-publication-source.mjs';
import { hostTarget } from './host-targets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const appId = 'io.github.gulagala001.oh-my-dsh';

function replaceOnce(text, from, to, file) {
  if (text.split(from).length !== 2) throw new Error(`Desktop source has an unexpected layout: ${file}`);
  return text.replace(from, () => to);
}

/** Prepare a disposable, pinned Desktop source tree with OMD in the build's package set. */
export async function prepareDesktopSource({ source, archive, destination }) {
  source = await realpath(source);
  archive = await realpath(archive);
  destination = resolve(destination);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const version = manifest.devDependencies['@deepseek-ai/dsh'];
  const target = hostTarget(version);
  const git = (args, options = {}) => execFileSync('git', args, { cwd: source, encoding: 'utf8', ...options });
  if (git(['rev-parse', 'HEAD']).trim() !== target.commit)
    throw new Error(`Desktop source must be checked out at DSH ${version} (${target.commit})`);

  await mkdir(dirname(destination), { recursive: true });
  git(['-c', 'core.autocrlf=false', 'worktree', 'add', '--detach', destination, target.commit], { stdio: 'inherit' });
  try {
    const bundle = join(destination, 'apps/desktop/omd-bundle');
    await mkdir(bundle);
    const packaged = join(bundle, 'oh-my-dsh.tgz');
    await copyFile(archive, packaged, constants.COPYFILE_EXCL);
    const files = packageFiles(await readFile(packaged));
    const metadata = JSON.parse(files.get('package/package.json')?.bytes ?? 'null');
    if (metadata?.name !== manifest.name || metadata.version !== manifest.version || metadata.devDependencies?.['@deepseek-ai/dsh'] !== version)
      throw new Error(`Use the built ${manifest.name}@${manifest.version} archive for DSH ${version}`);
    for (const file of ['lib/client.js', 'src/index.mjs', 'cordis.patch.yml']) {
      if (!files.get('package/' + file)?.bytes.length) throw new Error('Missing desktop bundle input: ' + file);
    }
    // These adapters execute from the checkout and must match the payload that the app loads.
    for (const [component, prefix] of [['vendor/opencu', 'host/'], ['plugins/deepseek-workbench', 'desktop/'], ['vendor/unharnessed', 'index.js']]) {
      const inventory = component + '.json';
      const baseline = await readFile(join(root, inventory));
      if (!files.get('package/' + inventory)?.bytes.equals(baseline)) throw new Error('Desktop archive differs from checkout: ' + inventory);
      for (const file of Object.keys(JSON.parse(baseline).files).filter(name => name.startsWith(prefix))) {
        const path = component + '/' + file;
        if (!files.get('package/' + path)?.bytes.equals(await readFile(join(root, path)))) throw new Error('Desktop archive differs from checkout: ' + path);
      }
    }

    for (const adapter of ['vendor/opencu/host/apply.mjs', 'plugins/deepseek-workbench/desktop/apply-host.mjs']) {
      execFileSync(process.execPath, [join(root, adapter), destination], { stdio: 'inherit' });
    }

    const changes = [
      ['apps/desktop/scripts/prepare-package-set.ts', [
        ['[DSH_PACKAGE, DESKTOP_HOST_PACKAGE] as const', "[DSH_PACKAGE, DESKTOP_HOST_PACKAGE, 'oh-my-dsh'] as const"],
        ['    buildPaths.packedDsh,', "    join(APP_ROOT, 'omd-bundle'),\n    buildPaths.packedDsh,"],
      ]],
      ['apps/desktop/src/project-manager.ts', [
        ['  initProfile(projectDir, WEB_PROFILE.bundles)', "  initProfile(projectDir, [...WEB_PROFILE.bundles, 'oh-my-dsh'])"],
      ]],
      ['apps/desktop/scripts/desktop-release-environment.mjs', [
        ['  const appId = requireEnvironmentValue(env, DESKTOP_APP_ID_ENV)', `  const appId = env[DESKTOP_APP_ID_ENV]?.trim() || '${appId}'\n  if (appId !== '${appId}') throw new Error('OMD Desktop requires its own application ID')`],
      ]],
      ['apps/desktop/scripts/desktop-package-environment.mjs', [
        ["DSH_DESKTOP_APP_ID: 'com.deepseek.harness'", `DSH_DESKTOP_APP_ID: '${appId}'`],
        ["if (target.platform !== 'darwin' || !options.unsigned) resolveDesktopPolicyEnvironment(environment)", 'if (!options.unsigned) resolveDesktopPolicyEnvironment(environment)'],
        ['|DOWNLOAD_TEST_(?:ORIGIN|RELEASE_ID))$/u.test(name)', '|DOWNLOAD_TEST_(?:ORIGIN|RELEASE_ID)|DOWNLOAD_PROD_ORIGIN)$/u.test(name)'],
      ]],
      ...publicationChanges,
      ['apps/desktop/scripts/electron-builder-config.mjs', [
        ["import { prepareWindowsAsarUnpack", "import { omdUnpackPatterns, verifyOmdResources } from './omd-runtime-resources.mjs'\nimport { prepareWindowsAsarUnpack"],
        ['    asarUnpack: unpack,', '    asarUnpack: [...unpack, ...omdUnpackPatterns],'],
        ['      // Unsigned Windows builds skip', '      await verifyOmdResources(resourcesDir, buildPaths.dsh, resolvedPlatform, resolvedArch)\n      // Unsigned Windows builds skip'],
        ['const policy = packagesMacOS && unsigned ? undefined : resolveDesktopPolicyEnvironment(env)', 'const policy = unsigned ? undefined : resolveDesktopPolicyEnvironment(env)'],
        ['  const buildVersion = resolveDesktopBuildVersion(env, productVersion)', `  const omdVersion = resolveDesktopBuildVersion({ DSH_DESKTOP_BUILD_VERSION: ${JSON.stringify(metadata.version)} }, productVersion)\n  const buildVersion = resolveDesktopBuildVersion(env, omdVersion)`],
        ["    protocols: [{ name: 'DeepSeek Harness', schemes: ['dsh'] }],", "    protocols: [{ name: 'Oh My DSH', schemes: ['oh-my-dsh'] }],"],
        ['      dshDesktopAppId: appId,', "      name: 'oh-my-dsh-desktop',\n      dshDesktopAppId: appId,"],
        ["    productName: 'DeepSeek Harness',", "    productName: 'Oh My DSH',"],
        ["      { from: buildPaths.runtime, to: 'runtime' },", "      { from: buildPaths.runtime, to: 'runtime' },\n      { from: join(buildPaths.root, 'omd-browsers'), to: 'omd-browsers' },"],
      ]],
      ['apps/desktop/scripts/package-target.ts', [
        ["const environment = target.platform === 'darwin' && invocation.unsigned", 'const environment = invocation.unsigned'],
        ['  if (requested === undefined) return productVersion', `  const omdVersion = validateDesktopBuildVersion(${JSON.stringify(metadata.version)}, productVersion)\n  if (requested === undefined) return omdVersion`],
        ['return validateDesktopBuildVersion(requested, productVersion)', 'return validateDesktopBuildVersion(requested, omdVersion)'],
        ['    productVersion, target: invocation.target.name,', '    productVersion: omdVersion, target: invocation.target.name,'],
        ["const appPath = join(buildPaths.artifacts, target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app')", "const appPath = join(buildPaths.artifacts, target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Oh My DSH.app')"],
        ["const appPath = join(artifactsRoot, target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'DeepSeek Harness.app')", "const appPath = join(artifactsRoot, target.arch === 'arm64' ? 'mac-arm64' : 'mac', 'Oh My DSH.app')"],
      ]],
      ['apps/desktop/src/main.ts', [
        ['let focusPrimaryWindow =', "// Keep durable data outside both applications' uninstallable Electron caches.\nprocess.env.DSH_HOME ??= join(app.getPath('appData'), 'oh-my-dsh-data')\nif (app.isPackaged) process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(process.resourcesPath, 'omd-browsers')\n\nlet focusPrimaryWindow ="],
        ["app.setAsDefaultProtocolClient('dsh')", "app.setAsDefaultProtocolClient('oh-my-dsh')"],
        ["url === 'dsh://open' || url === 'dsh://open/'", "url === 'oh-my-dsh://open' || url === 'oh-my-dsh://open/'"],
        ["          if (state.status === 'credential-stored' && attempt?.phase === 'succeeded' && welcomeWindow !== undefined) void enterWorkspace({ activate: false }).catch(() => undefined)", "          if (state.status === 'credential-stored' && attempt?.phase === 'succeeded' && welcomeWindow !== undefined && returnedAttempt !== attempt.id) {\n            returnedAttempt = attempt.id\n            void enterWorkspace().catch((error: unknown) => {\n              if (returnedAttempt === attempt.id) returnedAttempt = undefined\n              reportFatal(error, 'main')\n            })\n          }"],
      ]],
      ['apps/desktop/scripts/smoke-packaged-runtime.ts', [
        ["'DeepSeek Harness.app'", "'Oh My DSH.app'"],
        ["'DeepSeek Harness.exe'", "'Oh My DSH.exe'"],
        ["join(application, 'MacOS', 'DeepSeek Harness')", "join(application, 'MacOS', 'Oh My DSH')"],
      ]],
      ['apps/desktop/scripts/package-macos.ts', [
        ["'DeepSeek Harness.app'", "'Oh My DSH.app'"],
      ]],
      ['apps/desktop/scripts/verify-retained-desktop.ts', [
        ["'DeepSeek Harness.app'", "'Oh My DSH.app'"],
      ]],
      ['apps/desktop/src/login-shell-environment.ts', [
        ['if (SHELL_SESSION_KEYS.has(key) ||', "if ((key === 'PLAYWRIGHT_BROWSERS_PATH' && base[key] !== undefined) || SHELL_SESSION_KEYS.has(key) ||"],
      ]],
      ['apps/desktop/cli/dsh.cmd', [
        ['DeepSeek Harness.exe', 'Oh My DSH.exe'],
      ]],
      ['apps/desktop/cli/dsh', [
        ['MacOS/DeepSeek Harness', 'MacOS/Oh My DSH'],
      ]],
      ['apps/desktop-host/src/cli.ts', [
        ["import { basename, delimiter, dirname, join, resolve } from 'node:path'", "import { basename, delimiter, dirname, join, resolve } from 'node:path'\nimport { homedir } from 'node:os'"],
        ['  await runCli({', `  const appData = process.platform === 'win32'
    ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    : join(homedir(), 'Library', 'Application Support')
  process.env.DSH_HOME ??= join(appData, 'oh-my-dsh-data')
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(supportDir, '..', 'omd-browsers')
  await runCli({`],
      ]],
      ['apps/desktop/scripts/macos-runtime.ts', [
        ["import { createHash }", "import { pathToFileURL } from 'node:url'\nimport { createHash }"],
        ['  const bundles = new Set<string>()', `  const helper = 'node_modules/oh-my-dsh/vendor/opencu'
  const bundlePrefix = helper + '/native/bin/darwin-' + arch + '/OpenCU Helper.app/'
  if (kind === 'desktop') {
    const { checkMacHelperIdentity } = await import(pathToFileURL(join(root, helper, 'src/native/macos-identity.mjs')).href)
    await checkMacHelperIdentity(join(root, bundlePrefix))
  }
  const bundles = new Set<string>()`],
        ['    const bundle = CUA_HELPER_BUNDLE', "    if (kind === 'desktop' && path.startsWith(bundlePrefix)) continue\n    const bundle = CUA_HELPER_BUNDLE"],
      ]],
      ['apps/desktop/scripts/runtime-file-policy.ts', [
        ["  if (name.startsWith('@deepseek-ai/libreoffice-kit-'))", `  if (name === 'oh-my-dsh' && entry.startsWith('vendor/opencu/native/bin/darwin-')
    && (target.platform !== 'darwin' || entry.split('/')[4] !== 'darwin-' + target.arch)) return 'OpenCU other platform'
  if (name.startsWith('@deepseek-ai/libreoffice-kit-'))`],
      ]],
      ['apps/desktop/scripts/prepare-dsh.ts', [
        ["import { spawn } from 'node:child_process'", "import { spawn } from 'node:child_process'\nimport { createRequire } from 'node:module'"],
        ["import { delimiter, join, relative, resolve } from 'node:path'", "import { delimiter, dirname, join, relative, resolve } from 'node:path'"],
        ["    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:manifests'", `    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:omd-browser', () => new Promise<void>((done, reject) => {
      const browsers = join(BUILD_PATHS.root, 'omd-browsers')
      const omdRequire = createRequire(join(DSH_OUTPUT_ROOT, 'node_modules', 'oh-my-dsh', 'package.json'))
      const playwright = join(dirname(omdRequire.resolve('playwright/package.json')), 'cli.js')
      rmSync(browsers, { recursive: true, force: true })
      const child = spawn(NODE, [playwright, 'install', 'chromium'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PLAYWRIGHT_BROWSERS_PATH: browsers },
        stdio: 'inherit', windowsHide: true,
      })
      child.once('error', reject)
      child.once('close', (code, signal) => code === 0 ? done() : reject(new Error(\`OMD browser provisioning failed (\${signal ?? code})\`)))
    }))
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:manifests'`],
      ]],
    ];

    await copyFile(join(root, 'scripts/desktop-runtime-resources.mjs'), join(destination, 'apps/desktop/scripts/omd-runtime-resources.mjs'), constants.COPYFILE_EXCL);
    for (const [file, replacements] of changes) {
      const path = join(destination, file);
      let text = await readFile(path, 'utf8');
      for (const [from, to] of replacements) text = replaceOnce(text, from, to, file);
      await writeFile(path, text);
    }
    return destination;
  } catch (error) {
    try { git(['worktree', 'remove', '--force', destination], { stdio: 'inherit' }); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Preparing the OMD Desktop source failed', { cause: error }); }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, archive, destination, ...rest] = process.argv.slice(2);
  if (!source || !archive || !destination || rest.length)
    throw new Error('Usage: node scripts/prepare-desktop-source.mjs <pinned DSH checkout> <built OMD tgz> <new build worktree>');
  console.log(await prepareDesktopSource({ source, archive, destination }));
}
