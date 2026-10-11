# OpenCU on Windows

[简体中文](windows.md) · [English](windows_EN.md) · [Home](../README_EN.md) · [Usage](usage_EN.md) · [Development](development_EN.md)

Public **1.3.0** implements Windows browser, Chrome connection, and native desktop. Desktop uses foreground input, UI Automation, and capture; earlier validation includes single-display 125%, 150%, and 200%. **Unpublished local 1.6.1 has no real Windows-device validation in this round**; historical results do not replace it.

## Requirements and Installation

Node.js ≥22.19, pnpm 11.23.0, Git, and PowerShell 7. Initial 1.3.0 Chrome connection/desktop setup requires **.NET 10 SDK** and NuGet access; generated programs are self-contained. Desktop needs Windows 10 2004+, a matching x64/ARM64 build, and unlocked interactive desktop.

Finish tasks, stop service, and select the host. Alpha.1:

```powershell
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add github:gulagala001/opencu#v1.3.0
if ($LASTEXITCODE -ne 0) { throw 'OpenCU installation failed' }
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

rc.2:

```powershell
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add github:gulagala001/opencu#v1.3.0-dsh.0.2.0-rc.2
if ($LASTEXITCODE -ne 0) { throw 'OpenCU installation failed' }
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 --profile web
```

Open the printed login link and **Computer → Runtime and permissions**. Keep models, sessions, profile, and `DSH_HOME`. Desktop apps use their own manager/CLI, not another Web CLI for `desktop`. [Downloads/checksums](../README_EN.md#install). Public 1.3.0 lacks local 1.6.1's prebuilt Electron/new settings.

## Browser and Existing Chrome

Built-in browser uses a separate local Chrome/Chromium profile without automatic login inheritance. Install test Chromium from the plugin directory with `pnpm exec playwright install chromium` if needed, or specify an executable.

1. **Runtime and permissions → Prepare Chrome connection**; wait for build/user registration.
2. Enable developer mode at `chrome://extensions` and load the displayed directory.
3. Once connected, select the original tab using `@Chrome` or a tab reference.

No administrator launch is needed. Another-instance connections are preserved with a conflict message; remove at the original instance first. Reload after updates. **Remove Chrome connection** deletes registration but keeps pages/directory; remove extension in Chrome separately. Stop does not exit Chrome.

## Native Desktop

**Runtime and permissions → Install desktop control** builds locally in 1.3.0. Select actual discovered name/ID or full `.exe` path, using a concrete window when ambiguous. Stale references do not reopen automatically.

Foreground interaction is required. Physical mouse/keyboard input stops the assistant; wait before takeover, then resume. Lock screen/elevated windows are outside normal control. Observe again after scaling changes without old coordinates; mixed-DPI displays are outside scope.

Supports controls, capture, keyboard, click, drag, value/selection, and paste. Scrolling needs app UI Automation support. Ctrl/Alt/Shift/Win are Windows keys; `super` means Win. Markdown/HTML behavior depends on the app; inspect for inserted content after an error.

Preview clicks only view without activating the app. Stop allows observation; closing preview does not close apps, and stop does not exit launched apps. Basic checks do not establish all app, lock-screen, or architecture compatibility.

## Update and Remove

Stop service, repeat fixed install, and restart the profile. Update/repair native runtime when prompted and reselect the app; failed switching preserves old installation.

**Desktop control version → Remove desktop control** stops/removes it, preserving windows, files, and Chrome connection. Damage may require SDK rebuilding of the uninstaller. Unconfirmed stop/deletion retains information for retry; unrelated files are not removed.

Plugin removal uses matching CLI:

```powershell
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web remove opencu
```

Sessions/data remain; keep runtime for other owners. [Full instructions](usage_EN.md#update-and-remove).

## Control Windows from WSL

DSH in WSL can manually specify `OhMyDsh.Desktop.exe`. It activates only with Microsoft kernel identity and `computerUseNativeBinary`; ordinary Linux gains no desktop.

Build on Windows from **matching source**:

```powershell
$env:TRISOUL_CU_WINDOWS_NATIVE_OUTPUT = 'C:\DSH-WinDesktop'
node scripts/build-computer-use-windows-native.mjs
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
```

Architecture follows Node.js; `TRISOUL_CU_WINDOWS_ARCH` can be `x64` / `arm64`. Use project scripts to retain identity, not a `development`-marked program. Set actual path in WSL `opencu` configuration and restart:

```yaml
computerUseNativeBinary: /mnt/c/DSH-WinDesktop/OhMyDsh.Desktop.exe
```

Read-only source-directory check:

```sh
node scripts/check-wsl-desktop.mjs /mnt/c/DSH-WinDesktop/OhMyDsh.Desktop.exe
```

Checks identity, internal transport, interactive desktop, and capture without clicking/typing/launching. It is not full WSL device validation. Keep Windows unlocked and allow executable launch.

Manage the external binary manually; no pane installation/update/removal. Stop actions/service before replacing with matching binary and restarting. Bridging does not move browser/extension operation.

## Source and Diagnostics

Use fixed tags from [Development](development_EN.md), preferably a no-space path such as `C:\src\opencu`:

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$env:DSH_HOME = Join-Path $env:LOCALAPPDATA 'opencu-win-dev'
$env:PORT = '3090'
pnpm start
```

Developer Windows checks:

```powershell
pnpm exec playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Test browser installation failed' }
node scripts/test-windows.mjs
```

Isolated data, synthetic pages, and owned windows may operate the desktop; keep it unlocked without parallel input. Do not use real accounts/personal profiles. `report.json`/logs separate passed, failed, skipped, and unexecuted cases; skips are not passes. [Testing](development_EN.md#testing-and-validation). Everyday users can report versions/errors without running engineering acceptance tests.
