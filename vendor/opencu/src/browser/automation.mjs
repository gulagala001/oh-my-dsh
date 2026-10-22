import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const credentialFlag = value => /^--(?:use-mock-keychain|password-store)(?:=|$)/u.test(value);

/** Only for private automation profiles; never applied to CDP or user browsers. */
export function isolatedLaunchOptions(options = {}) {
  const args = [];
  for (let index = 0; index < (options.args?.length ?? 0); index++) {
    const arg = options.args[index];
    if (!credentialFlag(arg)) { args.push(arg); continue; }
    if (arg === '--password-store' && !options.args[index + 1]?.startsWith('--')) index++;
  }
  const ignored = options.ignoreDefaultArgs;
  return { ...options, args: [...args, '--use-mock-keychain', '--password-store=basic'],
    ...(Array.isArray(ignored) ? {ignoreDefaultArgs: ignored.filter(arg => !credentialFlag(arg))} : {}) };
}

/** Run arbitrary Playwright checks in one owned profile, closing it on every outcome. */
export async function withIsolatedBrowser(check, {directory = tmpdir(), launchOptions = {}, timeoutMs = 30000, signal, playwright} = {}) {
  if (typeof check !== 'function') throw new TypeError('A browser check callback is required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be a positive integer');
  signal?.throwIfAborted();
  await mkdir(directory, {recursive: true, mode: 0o700});
  const profile = await mkdtemp(join(directory, 'opencu-check-'));
  let context, timer, cancel, failure;
  const aborter = new AbortController();
  const active = signal ? AbortSignal.any([signal, aborter.signal]) : aborter.signal;
  try {
    const {chromium} = playwright ?? await import('playwright');
    active.throwIfAborted();
    context = await chromium.launchPersistentContext(profile, isolatedLaunchOptions({headless: true, ...launchOptions,
      timeout: Math.min(timeoutMs, launchOptions.timeout > 0 ? launchOptions.timeout : timeoutMs)}));
    active.throwIfAborted();
    timer = setTimeout(() => aborter.abort(Object.assign(new Error(`Browser check timed out after ${timeoutMs}ms`), {code:'BROWSER_CHECK_TIMEOUT'})), timeoutMs);
    return await Promise.race([
      Promise.resolve().then(() => check({context, signal: active})),
      new Promise((_, reject) => {cancel = () => reject(active.reason); active.addEventListener('abort', cancel, {once:true});}),
    ]);
  } catch (error) { failure = error; throw error; }
  finally {
    clearTimeout(timer); if (cancel) active.removeEventListener('abort', cancel);
    try {
      await context?.close();
      await rm(profile, {recursive:true, force:true});
    } catch (cleanup) {
      if (failure) throw Object.assign(new Error(`${failure.message}; browser cleanup failed: ${cleanup.message}`, {cause:failure}),
        {code:failure.code, details:{...failure.details, cleanup:{message:cleanup.message, profile}}});
      throw cleanup;
    }
  }
}
