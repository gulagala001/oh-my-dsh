import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

// Shared by the CI-only installer preparation and real Desktop boot fixture.
// Never forward Actions credentials, account/provider settings or NODE_OPTIONS.
export function desktopEnvironment(root, inherited = process.env) {
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']
    .filter(key => inherited[key] !== undefined).map(key => [key, inherited[key]]));
  const home = join(root, 'user-home'), cache = join(root, 'cache');
  return { ...env, HOME: home, USERPROFILE: home, DSH_HOME: join(root, 'home'),
    APPDATA: join(root, 'config'), LOCALAPPDATA: cache, XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CACHE_HOME: cache, XDG_DATA_HOME: join(root, 'data'), XDG_STATE_HOME: join(root, 'state'),
    TEMP: join(root, 'tmp'), TMP: join(root, 'tmp'), TMPDIR: join(root, 'tmp'),
    PI_CODING_AGENT_DIR: join(root, 'pi-agent'), PNPM_HOME: join(root, 'bin'), COREPACK_HOME: join(cache, 'corepack'),
    COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', npm_config_cache: join(cache, 'npm'), NPM_CONFIG_CACHE: join(cache, 'npm'),
    npm_config_userconfig: join(root, 'empty.npmrc'), NPM_CONFIG_USERCONFIG: join(root, 'empty.npmrc'),
    npm_config_prefix: join(root, 'npm-global'), NPM_CONFIG_PREFIX: join(root, 'npm-global'),
    DSH_TELEMETRY_DISABLED: '1', DESKTOP_HOST_FIXTURE: 'local-test-only', CI: 'true' };
}

export async function prepareEnvironment(root) {
  const env = desktopEnvironment(root);
  for (const path of new Set(Object.entries(env).filter(([key]) => /^(HOME|USERPROFILE|DSH_HOME|APPDATA|LOCALAPPDATA|XDG_|TEMP|TMP|PI_|PNPM_HOME|COREPACK_HOME|npm_config_(cache|prefix))/.test(key)).map(([, path]) => path)))
    await mkdir(path, { recursive: true });
  await writeFile(env.npm_config_userconfig, '', { mode: 0o600 });
  return env;
}
