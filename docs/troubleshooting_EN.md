# Troubleshooting

[中文](troubleshooting.md) · [Docs](README_EN.md) · [Getting started](getting-started_EN.md) · [Upgrade](upgrade_EN.md) · [Report a bug](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)

Find your symptom below. Keep the full error from the first failure; reinstalling or deleting data again and again only makes the problem harder to find.

<a id="check-the-running-environment"></a>

## Check that OMD is in the right place

1. **Version**: the current version in **Settings → Oh My DSH → About** is the OMD that is running; the latest version is only what is online. Check the DSH version separately. OMD 1.3.15 is for DSH 0.2.2-rc.2.
2. **Desktop or web**: the desktop app installs into the `desktop` profile, the web version into the profile in its start command, and the two do not share plugins.
3. **Data directory**: the web default is `.dsh` in your user folder. With `pnpm start` from source it is `data/dsh/` in the repository, profile `oh-my-dsh`, port 3083.
4. **Fully restart and try once**: wait for tasks to finish, fully quit and reopen the desktop app or restart the web service. Create an Oh My DSH session and send a message; after an upgrade, also open an old session.

<a id="package-source"></a>

### Check the install source

The repository is `gulagala001/oh-my-dsh` and the package is `oh-my-dsh`. Use the fixed package from the [installation guide](install_EN.md#gui). If the package name, repository or DSH version in the install log does not match, stop and check before updating the wrong target again.

<a id="by-symptom"></a>

## By symptom

| Symptom | What to do |
| --- | --- |
| `pnpm` not found, or Node is too old | The web version and source need Node.js 24.9.0+ and pnpm. The desktop app has its own runtime; install plugins inside the app and do not replace it with system Node |
| Install says it is incompatible with DSH | Note the actual DSH version and use the matching package from the [installation guide](install_EN.md). Do not switch to `latest` or skip the version check |
| Build scripts were not approved | See [install scripts were blocked](upgrade_EN.md#build-approval) |
| Offline check reports missing `node_modules` or a broken manifest | Plain source packages have no offline dependencies. Prepare again on a computer with the same system and architecture, as in [offline install](#offline) |
| Installed, but OMD does not appear | Check it is in the current profile and enabled, then fully restart. Create a session with Oh My DSH; old sessions keep their preset |
| Updated, but the current version is unchanged | The version on disk differs from the one running. Fully quit and reopen the desktop app, or restart the web service; reloading the page is not enough |
| Desktop says the service was updated and the interface version differs | Wait for tasks to finish, then use "Restart app and Host" or fully quit and reopen |
| Old conversations or model settings are missing | Check `DSH_HOME` and the profile first; see [moving from web to desktop](upgrade_EN.md#web-to-desktop). Do not set everything up again in an empty environment |
| An old session shows "History failed to load" | See [old sessions that fail to load](upgrade_EN.md#legacy-history-failure). Do not delete records or edit event numbers |
| Error mentions `plugin:oh-my-dsh/tool-optimization` and `not marked ignorable` | Upgrade to the current version, fully restart and reopen the session. OMD backs up the original log to `oh-my-dsh/session-record-repair/<session ID>/` before repairing it; logs that are being written or cannot be recognized are left untouched with a reason |
| Global background says another window changed it | Click **Read latest version**, compare and save again; reading never overwrites your draft |
| A third-party feature fails to install or hangs | Note the error, refresh and check the actual state; do not keep retrying the install |
| Fast does not appear or fails to save | Check that Subscription Login is installed and the selected model supports Fast |
| Dream failed for one scope but others have results | Finished parts are kept. Fix the cause and click retry to continue the unfinished scopes. Do not clear the database. See [Dream](dream-memory.md) (Chinese) |
| A chat is missing from a shared Dream project | Folders created for chats without a workspace are not projects and never share memory. Add a real workspace to share |
| Global Dream skipped a folder | Check the folders selected for global Dream; selecting none means all. Excluding a folder does not delete existing memory |
| Monitoring shows `≥`, `—` or an empty trend | `≥` is a known minimum and `—` means the provider did not report it. See [monitoring](monitoring.md) (Chinese) |
| A relative path landed in another directory | Tools, CodeGraph and Workflow follow the current execution directory; check it first |
| DeepSeek entry is there but the page or import does not work | The standard desktop app cannot embed web pages; open it in an external browser as prompted. See [DeepSeek Workbench](deepseek-workbench.md) (Chinese) |
| A computer-use component reports an error | Check that component's error in **Settings → Oh My DSH → Components** and prepare it as prompted. One failing component does not affect other features |

## Startup failure, blank page or endless `waiting for service`

"Waiting for service" is usually a consequence. Look for the first `failed to import` or startup error and keep the error type, `cause`, package path and stack.

- **Desktop**: the error dialog shows a `Diagnostic report` path; keep that log. If it offers to disable third-party plugins and restart, use it to see whether a plugin is involved, but it does not fix dependencies, so do not click it repeatedly.
- **Web**: keep the first error in the terminal that started the service. If the Plugins page opens, disable the failing plugin, restart and try a native session.
- **Source**: check that the source, SDK and build output belong to the same DSH version. Test with a separate profile, data directory and port, never your everyday setup.

If disabling a plugin fixes it, that only tells you the plugin is involved; the full error is still needed. Do not delete the whole `.dsh` or copy `node_modules` from another computer. Before rebuilding anything, make a [full backup](upgrade_EN.md#backup).

<a id="native-dependencies"></a>

### Missing `sharp` or other native dependencies, or Windows `EPERM`

If enhanced features fail to load, OMD keeps basic chat working and shows the first error in the interface. Rewind, computer use and Workflow load separately, and CodeGraph and `sharp` (for screenshots) only load when used.

1. Fully quit DSH and back up the profile, data and settings. Windows reports `EPERM` when files are in use; stop installing at that point and keep the first error.
2. Reinstall the fixed OMD package that matches your DSH from the original Plugins page. Do not mix dependencies from other versions or platforms.
3. With the same system, architecture and Node version as the failing DSH, run this in the actual install directory (or `pnpm runtime:check` in the source directory):

   ```sh
   node /path/to/profile/node_modules/oh-my-dsh/scripts/check-runtime.mjs
   ```

   It loads the plugin and its deferred dependencies one by one and has `sharp` produce a PNG; any failure returns a non-zero exit code with the original error. For the desktop app, run it with the app's bundled Node.
4. If it passes, restart as usual and try new and old sessions and the feature that failed. If it still fails, report the first error, full versions, system and architecture, profile and dependency path.

<a id="offline"></a>

## Offline install

The `.tgz` in a release is only the plugin, without dependencies. An offline package cannot move across systems or architectures; for Windows x64, prepare it on another Windows x64 computer. Do not just zip a directory after `pnpm install`, because its links break on another computer.

On an online computer with the same system and architecture as the target, get the OMD source, Node.js 24.9.0+ and pnpm 11.28.5, and run this from the source root. The output directory must be outside the source and must not exist yet:

```powershell
node scripts/prepare-host-sdk.mjs
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed' }
node scripts/prepare-offline.mjs 'C:\omd-offline'
if ($LASTEXITCODE -ne 0) { throw 'Offline preparation failed' }
```

On macOS / Linux, run `node scripts/prepare-offline.mjs /absolute/path/omd-offline`. The script takes only the release files, installs a fresh copy of dependencies without symbolic links, builds it and checks the OMD entry, `sharp` and CodeGraph. It never copies your settings, keys or conversations, and produces no directory if a check fails.

1. Zip the whole output directory (including `node_modules`), copy it to the offline computer and unzip it to a fixed place such as `D:\omd-offline`. Do not split it up or overwrite DSH's own `node_modules`.
2. On Windows, run `.\check-offline.cmd` in that directory; it uses the bundled runtime, so no Node install is needed. On other systems, run `node scripts/check-offline.mjs`.
3. In the desktop app, enter `link:D:\omd-offline` (your actual path) under **Plugins → Install → Local**. **Link the whole directory; do not install a `.tgz` or `file:` package.** Keep the directory in place, and reinstall if you move it.
4. Check that the DSH version matches `hostVersion` in `offline-manifest.json`, fully restart and try a new session with a tool call. For the web version, keep the same `DSH_HOME` and profile and add `link:/absolute/unzipped/path` from the command line, with `--offline` if needed.

Your model service must still be reachable. Browsers, Python, .NET and computer-use components need to be prepared separately.

## Reporting a problem

Use the [bug template](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml) and include:

- System and architecture; desktop, web or source; DSH and OMD versions.
- Install source and profile name; whether the data directory is custom (no need to show private paths).
- The shortest steps to reproduce, what you expected and what happened, since which version, and whether it happens every time.
- The first full error and related log lines, screenshots if useful, and what you already tried.

Before posting, hide API keys, sign-in tokens and private conversations. Do not upload the whole data directory or `.credentials.yaml`. Write "unknown" for anything you cannot find.
