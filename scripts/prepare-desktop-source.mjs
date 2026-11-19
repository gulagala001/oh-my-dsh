import { execFileSync } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hostTarget } from './host-targets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const packageMember = 'package/package.json';

function replaceOnce(text, from, to, file) {
  if (text.split(from).length !== 2) throw new Error(`Desktop source has an unexpected layout: ${file}`);
  return text.replace(from, to);
}

/** Prepare a disposable, pinned Desktop source tree with OMD in the build's package set. */
export async function prepareDesktopSource({ source, archive, destination }) {
  source = await realpath(source);
  archive = await realpath(archive);
  destination = resolve(destination);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const version = manifest.engines.dsh;
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
    const metadata = JSON.parse(execFileSync('tar', ['-xOf', packaged, packageMember], { encoding: 'utf8' }));
    if (metadata.name !== manifest.name || metadata.version !== manifest.version || metadata.engines?.dsh !== version)
      throw new Error(`Use the built ${manifest.name}@${manifest.version} archive for DSH ${version}`);
    const members = new Set(execFileSync('tar', ['-tf', packaged], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim().split(/\r?\n/));
    for (const member of ['lib/client.js', 'src/index.mjs', 'cordis.patch.yml', 'vendor/opencu/lib/rea-assets/manifest.json']) {
      if (!members.has(`package/${member}`)) throw new Error(`The OMD archive is missing ${member}`);
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
      ['apps/desktop/scripts/electron-builder-config.mjs', [
        ['  const appId = resolveDesktopAppId(env)', "  const appId = resolveDesktopAppId(env)\n  if (appId !== 'io.github.gulagala001.oh-my-dsh') throw new Error('OMD Desktop requires its own application ID')"],
        ["    productName: 'DeepSeek Harness',", "    productName: 'Oh My DSH',"],
      ]],
      ['apps/desktop/src/main.ts', [
        ['let focusPrimaryWindow =', "// Keep OMD's desktop profile separate from a stock DSH installation.\nprocess.env.DSH_HOME ??= join(app.getPath('userData'), 'harness')\n\nlet focusPrimaryWindow ="],
      ]],
      ['apps/desktop/scripts/smoke-packaged-runtime.ts', [
        ["'DeepSeek Harness.exe'", "'Oh My DSH.exe'"],
        ["join(application, 'MacOS', 'DeepSeek Harness')", "join(application, 'MacOS', 'Oh My DSH')"],
      ]],
      ['apps/desktop/scripts/prepare-dsh.ts', [
        ["    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:manifests'", `    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:omd-browser', () => new Promise<void>((done, reject) => {
      const child = spawn(NODE, [join(DSH_OUTPUT_ROOT, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PLAYWRIGHT_BROWSERS_PATH: join(DSH_OUTPUT_ROOT, 'omd-browsers') },
        stdio: 'inherit', windowsHide: true,
      })
      child.once('error', reject)
      child.once('close', (code, signal) => code === 0 ? done() : reject(new Error(\`OMD browser provisioning failed (\${signal ?? code})\`)))
    }))
    await packagingStep(process.env.DSH_DESKTOP_PACKAGING_RUN_DIR, 'runtime:manifests'`],
      ]],
      ['apps/desktop-host/src/index.ts', [
        ["import { delimiter, join } from 'node:path'", "import { delimiter, join } from 'node:path'\nimport { existsSync } from 'node:fs'"],
        ['  const projectDir = process.argv[3] as string', "  const projectDir = process.argv[3] as string\n  const bundledBrowsers = join(runtimeDir, 'omd-browsers')\n  if (existsSync(bundledBrowsers)) process.env.PLAYWRIGHT_BROWSERS_PATH ??= bundledBrowsers"],
      ]],
    ];

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
