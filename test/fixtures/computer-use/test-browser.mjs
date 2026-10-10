import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

export async function isolateTestDownloads(root, profile = join(root, 'browser-profile')) {
  if (!resolve(profile).startsWith(resolve(root) + sep)) throw Error('Test browser profiles must stay inside their disposable root');
  const directory = join(profile, 'fixture-downloads');
  await mkdir(join(profile, 'Default'), { recursive: true });
  await mkdir(directory, { recursive: true });
  await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({ download: { default_directory: directory, prompt_for_download: false } }));
  return directory;
}

// Only for fresh disposable test profiles. Production browser profiles retain
// OS-backed credential storage and must never be switched to a mock keychain.
export async function testBrowserExecutable(directory, executable = chromium.executablePath()) {
  const flags = process.platform === 'darwin' ? ['--use-mock-keychain', '--password-store=basic'] : process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : [];
  if (!flags.length) return executable;
  const wrapper = join(directory, 'isolated-test-browser');
  const quoted = "'" + executable.replaceAll("'", "'\\''") + "'";
  await writeFile(wrapper, '#!/bin/sh\nexec ' + quoted + ' ' + flags.join(' ') + ' "$@"\n', { mode: 0o700 });
  return wrapper;
}
