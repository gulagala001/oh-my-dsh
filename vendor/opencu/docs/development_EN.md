# OpenCU Development

[简体中文](development.md) · [English](development_EN.md) · [Home](../README_EN.md) · [Integration](integration_EN.md) · [Index](README_EN.md)

Shared implementation, extension, native services, and tests live here. Standalone/complete integration reuse the same implementation. Public **1.3.0** is separate from unpublished local **1.6.1**; new captures do not substitute for public source.

## Get Public Source

Requirements: Node.js ≥22.19, pnpm 11.23.0, Git. Alpha.1:

```sh
git clone --branch v1.3.0 https://github.com/gulagala001/opencu.git
cd opencu
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install chromium
pnpm start
```

For rc.2, change clone tag to `v1.3.0-dsh.0.2.0-rc.2`. Public main is based on 1.3.0, without local Electron/site/import implementations. [Fixed release/checksums](https://github.com/gulagala001/opencu/releases/tag/v1.3.0).

`pnpm start` defaults to isolated `data/dsh/` and port 3084; set `DSH_HOME` / `PORT` as needed. Open the logged login link and configure a test model. Keep development and everyday private directories separate.

## Code Entry Points

| Location | Responsibility |
| --- | --- |
| `src/index.mjs`, `src/config.mjs` | Plugin/schema |
| `src/integration.mjs` | Sharing, configuration owners, disposal |
| `src/computer-use/` | Tools, browser, native, files, observation |
| `src/client/` | DSH UI/components |
| `browser-extension/` | Chrome connection |
| `native/computer-use/` | macOS/Windows source |
| `scripts/` | Build, start, checks |
| `vendor/dsh-chat/` | Matching Chat snapshot/targeted modifications |
| `test/` | Protocol/backend/real browser/UI regressions |

[Public exports](integration_EN.md) show actual use. `lib/client.js` is a loader build, not a Node ESM SDK. Preserve runtime resources, host services, and lifecycle.

## Native Builds

Version 1.3.0 initially builds desktop components. macOS 14+ needs Apple Command Line Tools/permissions; Windows 10 2004+ needs PowerShell 7, .NET 10 SDK, and NuGet. Entries:

```sh
node scripts/build-computer-use-native.mjs
```

```powershell
node scripts/build-computer-use-windows-native.mjs
```

macOS local signing/permissions are documented in [native README](../native/computer-use/README.md). Development signing does not establish Developer ID, notarization, or updater delivery. Preserve Windows build identity/architecture. Do not commit personal signing materials, keychains, or temporary artifacts.

New local 1.6.1 work uses official prebuilt Electron 44.7.0 and complete-package native prebuilds by design. This round's changes are absent from OpenCU's public 1.3.0. OMD main includes the corresponding snapshot; package contents and host versions still require verification. Do not use new scripts against 1.3.0 or promise no compilation for that version.

## Testing and Validation

Normal regression:

```sh
pnpm test
```

Targeted real UI:

```sh
node --test test/computer-use-ui.test.mjs
node --test test/browser-dialog-ui.test.mjs
```

`test/computer-use-native-ui.test.mjs` covers native UI. Desktop tests require platform/permissions/interaction. Authorized macOS service can specify socket:

```sh
TRISOUL_CU_NATIVE_SOCKET=/path/to/runtime.sock node --test test/computer-use-native.test.mjs
```

Full Windows entry is `node scripts/test-windows.mjs`; native tests:

```powershell
$env:TRISOUL_CU_WINDOWS_NATIVE_TEST = '1'
node --test --test-concurrency=1 test/computer-use-windows-native-protocol.test.mjs test/computer-use-windows-native.test.mjs
```

Use isolated browsers, synthetic pages, and owned windows without personal keychain/account requests. Avoid parallel physical input. Check executed/skipped/budget/cleanup results; missing conditions or failed cleanup are not passes. This round has no Windows hardware validation of the new implementation; historical CI applies only to its tested version.

Based on risk, check stop, takeover, resume, timeout, reset, duplicate actions, close, and restart. Multi-plugin work checks both load orders, sharing, and separate removal. UI checks cover actual layout, clicks, themes, and narrow screens. Inspect real page/app/file outcomes beyond acknowledgments.

## Compatibility and Contributions

Public builds pair full DSH versions with SDK, Chat, and lockfile; widening peers alone does not establish support. Upgrades need installation, tools, modes, UI, recovery, enable/disable, restart, removal, and representative coexistence checks.

OpenCU uses the native tool loop without another model orchestration layer. Sharing avoids duplicates; Chat snapshots/other UI still need compatibility checks. Legacy bundle/data/extension/protocol identifiers preserve installation contracts.

Explain issue, version, behavior, change, and validation in contributions. Mark release status and use actual UI images. Use synthetic reproduction; do not commit real conversations, personal profiles, cookies, credentials, logs, or test outputs. Public source retains product code, maintenance tests/synthetic fixtures, and user/developer docs. Releases check Git files/history/tags/package lists. [Third-party notices](../THIRD_PARTY_NOTICES.md) · [Issues](https://github.com/gulagala001/opencu/issues).
