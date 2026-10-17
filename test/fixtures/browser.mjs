import { mkdir, realpath, lstat, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative, sep } from 'node:path';
import { chromium } from 'playwright';
import { createOwnedFixtureDirectory, fixtureRetention } from './fixture-evidence.mjs';

export const testBrowserArgs = () => process.platform === 'darwin'
  ? ['--use-mock-keychain', '--password-store=basic']
  : process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [];

export async function isolateTestDownloads(root, profile = join(root, 'browser-profile')) {
  const inside = (parent, path) => resolve(path).startsWith(resolve(parent) + sep);
  if (!inside(root, profile)) throw Error('Test browser profiles must stay inside their disposable root');
  const trusted = await realpath(root);
  // Check every existing/created ancestor before touching the next one. A
  // lexically in-root profile can otherwise follow a symlink into user data.
  let current = trusted;
  for (const part of relative(resolve(root), resolve(profile)).split(sep)) {
    current = join(current, part); await mkdir(current, { recursive: true });
    current = await realpath(current);
    if (!inside(trusted, current)) throw Error('Test browser profile symlink escapes its disposable root');
  }
  const childDirectory = async name => {
    const path = join(current, name); await mkdir(path, { recursive: true });
    const target = await realpath(path);
    if (!inside(trusted, target)) throw Error('Test browser profile symlink escapes its disposable root');
    return target;
  };
  const defaults = await childDirectory('Default'), directory = await childDirectory('fixture-downloads');
  const preferences = join(defaults, 'Preferences');
  const info = await lstat(preferences).catch(error => { if (error.code === 'ENOENT') return undefined; throw error; });
  if (info?.isSymbolicLink()) throw Error('Test browser preferences must not be a symlink');
  const value = await readFile(preferences, 'utf8').then(JSON.parse, error => { if (error.code === 'ENOENT') return {}; throw error; });
  await writeFile(preferences, JSON.stringify({ ...value, download: { ...value.download, default_directory: directory, prompt_for_download: false } }));
  return directory;
}

// Explicit legacy CU opt-in uses the already prepared test browser, never a
// newer OpenCU runtime or the user's browser profile/keychain.
export async function testBrowserExecutable(directory, executable = chromium.executablePath()) {
  const flags = testBrowserArgs();
  if (!flags.length) return executable;
  const wrapper = join(directory, 'isolated-test-browser');
  const quoted = "'" + executable.replaceAll("'", "'\\''") + "'";
  await writeFile(wrapper, '#!/bin/sh\nexec ' + quoted + ' ' + flags.join(' ') + ' "$@"\n', { mode: 0o700 });
  return wrapper;
}

// Playwright's anonymous profile would be removed by its own unguarded temp
// cleanup. A persistent profile gives this fixture creation-time removal authority.
// onDirectory receives audit data plus a closure-only guard for outer fixture
// cleanup, including launch failure. It does not grant path-based deletion.
export async function launchFixtureBrowser({ env, executablePath = chromium.executablePath(), retainFixture, onDirectory } = {}) {
  const retain = fixtureRetention(retainFixture);
  const owned = await createOwnedFixtureDirectory('omd-fixture-browser-', env?.TMPDIR ?? env?.TMP ?? env?.TEMP);
  const root = owned.path;
  let profileOwner, launchedBrowser, browserStopped = false, profileRemoved = false, rootRemoved = false;
  const assertDirectory = async () => {
    if (rootRemoved) return;
    await owned.assertIdentity(); if (profileOwner && !profileRemoved) await profileOwner.assertIdentity();
  };
  try {
    if (!env) {
      const inherited = Object.fromEntries(['PATH','SystemRoot','WINDIR','COMSPEC','PATHEXT','LANG','LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
      env = { ...inherited, HOME: join(root, 'home'), USERPROFILE: join(root, 'home'),
        XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'),
        APPDATA: join(root, 'config'), LOCALAPPDATA: join(root, 'cache'), TMPDIR: join(root, 'tmp'), TMP: join(root, 'tmp'), TEMP: join(root, 'tmp') };
      for (const path of ['home','config','cache','tmp']) await mkdir(join(root, path));
    }
    profileOwner = await createOwnedFixtureDirectory('profile-', root);
    const profile = profileOwner.path;
    await isolateTestDownloads(root, profile);
    await onDirectory?.(Object.freeze({ ...owned.audit, profile: profileOwner.audit }), assertDirectory, () => browserStopped);
    const context = await chromium.launchPersistentContext(profile, { headless: true, executablePath, env, args: testBrowserArgs(), serviceWorkers: 'block' });
    const browser = context.browser(); launchedBrowser = browser;
    if (!browser) { await context.close(); throw Error('Fixture Chromium did not expose its browser'); }
    const close = browser.close.bind(browser), closeContext = context.close.bind(context); let closing;
    browser.close = options => closing ??= (async () => {
      const errors = []; let closeCompleted = false;
      try { await close(options); closeCompleted = true; } catch (error) { errors.push(error); }
      // close() awaits the browser process. A rejected, still-connected browser
      // must not have its live profile recursively removed underneath it.
      if (!closeCompleted || browser.isConnected()) {
        if (browser.isConnected()) errors.push(Error('Fixture browser did not exit before profile cleanup'));
        try { await closeContext(options); closeCompleted = true; } catch (error) { errors.push(error); }
      }
      browserStopped = closeCompleted && !browser.isConnected();
      if (!browserStopped) errors.push(Error('Fixture browser exit could not be confirmed; profile retained'));
      if (browserStopped && !retain) {
        try { await assertDirectory(); await profileOwner.remove(); profileRemoved = true; await owned.remove(); rootRemoved = true; }
        catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Fixture browser close/profile cleanup failed');
    })();
    Object.defineProperty(browser, 'fixtureDirectory', { value: Object.freeze({ ...owned.audit, profile: profileOwner.audit }) });
    Object.defineProperty(browser, 'assertFixtureDirectory', { value: assertDirectory });
    return browser;
  } catch (error) {
    browserStopped = !launchedBrowser?.isConnected();
    if (!retain && browserStopped) {
      try {
        await assertDirectory();
        if (profileOwner) { await profileOwner.remove(); profileRemoved = true; }
        await owned.remove(); rootRemoved = true;
      } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Fixture browser launch and profile cleanup failed'); }
    }
    throw error;
  }
}
