# Official rc.2 Desktop host boot acceptance

The Desktop workflow prepares the hash-verified official Windows x64/macOS
arm64 app and a frozen local OMD tgz, then runs:

```sh
node --test --test-reporter=tap test/desktop-host-boot.test.mjs
```

All five `OMD_DESKTOP_*`/`OMD_PLUGIN_*` inputs checked by `inputs.mjs` are
mandatory. Files must be under the workflow's fresh `.cache/desktop-build-*`
directory in this checkout, on a disposable GitHub-hosted CI runner. Missing files, an SDK mismatch or an unsupported
platform fail. CI requires exactly one executed/passing test and zero skips,
plus a successful evidence JSON after cleanup.

The test boots the real `dsh-app://app/` renderer, installs the tgz through the
official plugin manager, quits the official app, waits for both Electron and
the real Host to exit successfully, and cold-boots the installed client. A
test-only package reads the actual public conversation registries and
`slots.snapshot()`. It contributes no UI and replaces no Host services. The
Host `llm/stream` listener throws on every call; a loopback-only provider also
fails any request. Counts cover installation, both boots and shutdown.

HOME, DSH_HOME, userData, profiles, XDG/AppData and package-manager caches are
temporary; the app/installer receive an environment allowlist without Actions
tokens. Home `cordis.patch.yml` is the final configuration layer and restores
`read-only`/`ask` after OMD bundle defaults. All three OpenCU backends are false.
In rc.2 `approval: never` means rejection without prompting, not approval.
No prompt, tool action, login or real credential is used. Renderer routing is
not a process-wide egress fence. Public dependency/update traffic is not model
traffic and is not claimed to be zero.

`host-boot-evidence/` contains the sanitized JSON, logs and synthetic screenshots.
Successful restart evidence requires every Host observer activation to dispose,
reach `beforeExit` (which a CLI timeout's `process.exit(0)` bypasses), and exit
with code 0, no termination signals, and Electron to exit without a
signal before Playwright close. Failure cleanup may use Playwright's owned
process cleanup, fails the test and retains files if close/Host exit is uncertain.
This is no conversation-persistence or native CU attestation. #54 rc.1 pairing
and #64 real native actions remain for a separate matching acceptance run.

Interfaces were checked against official source at
[`687f282e` (rc.2)](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317):
`apps/desktop/src/{main,welcome-backend,host-process}.ts`,
`apps/desktop-host/src/index.ts`, `apps/cli/src/profile-boot.ts`,
`packages/client/ui-slots/src/index.ts`, and
`packages/interaction/user-approval/README.md`.
