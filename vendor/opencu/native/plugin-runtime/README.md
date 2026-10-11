# Official Plugin Runtime

OpenCU uses the unmodified official Electron 44.7.0 prebuilt distribution. Browser and native presentation helpers share one installation and run in separate processes. The installer does not compile a browser, change DSH, or resign Electron.

`npm run prepare:runtime` installs the current platform and architecture. `node scripts/prepare-plugin-runtime.mjs --check` reports actual installed readiness and verifies the retained official ZIP, every extracted file and link, executable architecture, and the distribution version. `--path` performs the same verification before returning an executable. Browser and presentation requests never download a runtime.

`releases.json` pins the ZIP checksums from the official `electron@44.7.0` npm package. The installer uses that exact dependency's official downloader and confirms the downloaded archive against the plugin's fixed checksum, including when a download mirror is configured. A local manifest cannot authorize changed executable bytes. Installation occurs in a user-owned OpenCU runtime directory and uses a temporary directory followed by atomic publication. Existing runtime directories are retained while processes may still own them.

For offline installation, `node scripts/prepare-plugin-engine.mjs --archive /absolute/electron-v44.7.0-PLATFORM-ARCH.zip` accepts only the same pinned official archive. The compatibility command no longer accepts custom engine source identities or complete custom distributions. `OPENCU_SOURCE_ONLY=1` permits dependency setup without downloading a runtime and leaves runtime readiness unavailable until the ordinary installer is run.

The macOS presentation binding is independently packaged under `native/desktop-presentations/prebuilt/darwin-ARCH`. Its Node-API, architecture, checksum and signature checks do not bind it to Electron's signing team. Supported runtime archive targets are macOS, Windows and Linux on arm64/x64; platform-specific browser, desktop and presentation feature acceptance is separate from archive availability.
