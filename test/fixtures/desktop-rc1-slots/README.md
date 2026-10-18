# Official rc1/mac-x64 slot acceptance (#54)

This is a separate acceptance path for the official `0.2.1-rc.1` Intel Mac app
and the already published `0.2.1-rc.1.omd.0.17.4` tgz. It neither retargets the
rc2 checkout nor builds/repackages OMD. `desktop-rc1-slot-inputs.json` pins the
exact URL, size and SHA-512 from the public mac-x64 feed snapshot obtained on
2026-10-18, plus the released OMD size/SHA-256 and tag commit. Preparation does
not refetch that feed, guess another URL, use adapters.zip or retry a denied
download through another channel. A hash/size/pairing mismatch fails.

Only the new `desktop-rc1-slots.yml` job runs GUI, on disposable
`macos-15-intel`. It downloads the original files, checks the helper mode in the
original tgz, and never repairs/repackages that release. A helper mode other
than 0755 fails with its observed value before installation. Linux runs only
the dependency-free contracts. Windows rc1 remains unimplemented because
historical installer SHA-512 metadata is missing. No skip is a successful run.

The single Desktop test cold-boots stock, installed, disabled and reenabled,
and observes four natural Electron/Host exits. It calls public
`pluginManager.installBundle(file:...)` once and
`setBundleEnabled({name:'trisoul_x', enabled})` twice. Each receipt must say
changed=true, agree with persisted profile selection and `listBundles`, and
receive cold verification. An applied receipt additionally requires the same
Electron/Host PIDs and real UI convergence. Graph identity uses the current
Host `ctx.clientModules.graph().rev` and the actual renderer module table,
never a stale boot rev or a fabricated boot object.

Stock creates one empty `standard` session by RPC. Before every open, the
client observer calls public `sessions.refresh()`, checks `list.byId`, and
calls `uiWorkspace.openSession(id)`. Acceptance observes the actual
`uiSession.adapter.current` session id, positive `retainInfo(id).mainView`, a
visible composer, blank=true and promptAttempted=false. It never renames or
clicks an invisible blank-session tree title, writes private Session state,
submits a prompt or clicks a model/CU action.

Model and label declarations must be unique, label a direct model child and
its declaration owner unchanged. Empty rc1 label occupancy is valid; no rc2
label-1017 occupant is required. Stock/disabled have one official model
occupant. Installed/reenabled have exactly two, one active at stock priority
minus 0.5 and stock inactive, with exactly one visible `模型与思考强度` button.
Disabling removes OMD Host/client rows, model takeover, business contributions
and button, and restores official conversation/chat. Failed fibers, duplicate
registrations, renderer errors and model requests fail.

Isolation and natural shutdown follow PR68 without editing its files. The
shared version-independent environment/path/ASAR identity faces are reused;
its rc2 input guard is untouched. The actual runtime resolves SDK packages in
the official ASAR at rc1, never the runner's checkout SDK. Profiles, userData,
package-manager caches and process HOME stay under a fresh checkout `.cache`
child. Actions/provider credentials and NODE_OPTIONS are not forwarded. No
credential file or account sign-in is created. A prepended Host llm listener
rejects streams; a loopback-only sentinel rejects requests. All three real
OpenCU settings are false; there is no fictitious computerUseEnabled flag.
The native OS home/log path exception is limited to the disposable runner:
the official shell may prune/write its default logs; the test does not read
or copy native home account data. Renderer routing is not process-wide
network isolation or a zero-egress claim.

Passing evidence requires exactly 1 executed/1 pass/0 skips, four stage
snapshots, four natural shutdowns and three receipts, plus cleanup success.
Each Host observer activation must dispose, reach beforeExit with Loader
unloaded, and exit 0 with no signal/model call. Forced/uncertain cleanup fails
and retains the profile. Sanitized screenshots, logs, lifecycle and JSON/TAP
are uploaded; the temporary profile and downloaded binaries are not uploaded.
This does not attest #64 native authorization/CU actions or Windows behavior.

Official call-chain review used deepseek-harness
`1600d8a1e140dcde43a1a0941940a0480712c011`: desktop main/host-process and
desktop-host, CLI profile-boot, boot/plugin-manager index/types/operations,
client modules graph and module system, workspace navigation, ui-session
adapter and api-session-controller manager/service, web seed table and Cordis
fiber states. The published OMD pin is tag commit
`748ebfe6e07d79455cb11c3f9d7b4c91d75e52ef`.
