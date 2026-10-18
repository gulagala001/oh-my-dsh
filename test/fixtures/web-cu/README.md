# Real rc.2 Web session CU acceptance — implementation under review

The original hosted-CI entry accepts **only** the independently reviewed complete PR75 archive:
`205762eddc9f9e78102dc44fbdd2164cd2b8b419da73ecd6e5c813685ca6d85c`,
OMD `7f7d663e6a78d3265cbeaacef35ed0ff64bdcaa4`, OpenCU
`53128743490aa10e4e36e9ab9de3c492ad0f973d`, DSH **0.2.1-rc.2**.
Root client SHA is `cd4864846bb58b10648facdacf390052ee119dd1b19ab685cdf33be90441410c`;
installed helper must retain0755. A newly packed archive containing these new
tests is not an acceptable replacement; another product SHA needs independent
manifest/tree review before changing the constant. No download of rejected
artifact paths is required by the local contracts.

Issue69's rc.1 deployment and Windows11 Edge + WSL24.04 require separate matched
acceptances. This implementation neither changes production defaults nor
proves any GUI pass. Default-hidden approval UX and all original failed runs
remain evidence. Normal tool-group expansion is recorded, not called a UX fix.

## Production path

A uses original Web composer and `停止生成`: default input sink → conversation
sendSession/session.prompt, original ToolRuntime's native computer_use schema →
OpenCU tools.execute with actual exec.agent.session.id/exec.signal → original
shared runtime/computer session → original MV3 extension. No alternate tool,
Host, model result or business RPC is supplied. The only model replacement is
existing createSimulationProvider({respond}), on owned loopback HTTP/SSE.
Native-tool `trisoul-x` is used; PTC-only wire fails, not synthesized or bypassed.

The scenario is armed by the actual UI submission phase. Continuation pairs
its issued assistant tool_call_id, exact arguments, current exact user marker
and immediately matching real tool result. It accepts only original JSON plus
exact official image-handle suffixes (using requestImageHandleText), and the
actual pi-ai trailing image user shape. Old/quoted markers cannot advance a
phase, missing results cannot mint receipts, and replay fails. Contracts call
original renderResult and installed pi-ai1.1.0 public convertMessages. rc.2's
private userContent is not exported: wire-contract.mjs explicitly labels its
small source-corresponding block mapping (lib/index.js1220–1245,1410); these
contracts are not an executed Host adapter or GUI acceptance.

Binding performs an initial production AX observation. Full-text assertions
explicitly request disableDiffing:true. The actual cell also requests default
unchanged and changed AX diffs, checks their real text and records all four
observations in its output. Contracts import original createObservationProjector
for full→unchanged diff→changed diff→explicit full. Production diff defaults stay
unchanged. Screenshot references must read through authenticated session/attachment,
hash-match original PNG bytes and render in the actual A tool card; console,
page and card image-load errors fail. Independent synthetic target records
nonce, input value, trusted events, exactly one click before cancellation and
one after recovery, and trusted Shift release. All target actions use CU.

## Implemented A/B harness and source boundary

`harness.mjs` implements the minimum lifecycle rather than leaving opaque
callbacks to a future runner. `owned-browser.mjs` extracts reviewed predicates,
operation tracking, process identity/group/ancestry checks and failure-only
cleanup from `gulagala001/opencu@e545798ac8d1dc8c4e3e3cdd322961650aca5461`,
`test/extension-pairing-real.test.mjs` SHA
`bc97d5670c5b5125a57e2803f61399d6b1be528c6432a15da092f097b46b9172`.
Every browser owns independent raw child, group, profile, CDP/control and pending
operations. No global active browser can cross A/B ownership. Actual command
line must confirm exact profile and security defaults; no no-sandbox/CSP/OS
permission bypass. Launch flags preserve the reviewed --use-mock-keychain.

The referenced official Mac preflight run39112179493/job117630463453 established
startup, NodeGET, Chrome default10s load/DOM and natural exit/close/group removal
for that fixed setup, **runtime/Allow0**. Earlier navigation/cleanup failures
remain failures. None of those runs proves this new pairing/session journey.
The original `harness.mjs` CI entry is restricted to nonroot official disposable GitHub-hosted
macOS15 arm64 with the existing private PW1.63.0/CfT153.0.8010.12 revision1243
installation. It verifies the existing cache owner marker, installation evidence
and executable hash. It never installs/downloads a browser or dependencies.
The original installation/execution wrapper retains cache deletion authority.
This helper cannot reconstruct that authority from a marker or path, never
removes the external browser cache, and reports cacheRemoved:false. The final
execution package must separately prove cacheRemoved after both browsers and
owned groups have exited. This harness deletes
its own newly allocated root/profiles only through the existing directory-owner
closure after every process is confirmed stopped; otherwise retains them.

B preflight loads original packaged ZIP members, validates unpaired options,
NodeGET and Chrome default load/DOM **before starting Host**. Then original
Host /api/opencu/extension.zip download must match those exact bytes. A's actual
settings Connect browser button creates demand, B's original Allow responds,
and both original UI and Host capability connection/pairing counts must settle.
A then checks the original stable SettingsRow for the same API connection/profile
(instanceId/browserInstanceId/epoch and saved pairing/extension identity), exact
ready description, manage/disconnect/revoke buttons, and actual connection count.
ConnectionStatus is an ordinary span; transient pairing role=status is not
required after CapabilityProvider refresh. Only then are all B PW operations drained and its transport disconnected while
raw Chrome remains alive. Old options/driver/control references are discarded.
A remains connected; CU discovers B and creates its own target via tabs.new.
TARGET_BUSY protection remains unchanged. A renderer requests are restricted
to owned Host/data/blob origins; this is not a claim of zero process-wide network.

`worker-reader.mjs` connects only to B's validated owned Browser endpoint and
attaches precisely the original background.js **service_worker**, never a page.
Network.enable passively observes only the exact origin/port/base path returned
by this original options status.endpoint, never other Hosts in the port range.
Only projected command/result ID, hashed extension session, identity/epoch,
nonce locator, held command and release facts enter its bounded ledger. No
routing or Node HTTP monkeypatch, no headers/token/full URL/raw body retention.
The /result HTTP receipt is accepted:true; original request ok:true separately
proves execution. Ignored/missing acceptance, wrong session/identity/epoch and
failed release remain failures. Missing Network body, redirect, stale result,
wrong worker/session, active disconnect and read timeout fail closed. DSH session is correlated through original native
cancel tool call + unique nonce locator + target occurrence, never by equating
it with extension sessionId. Full-session release ACK is distinguished from a
targeted ACK and must match the held command's original extension-session hash.
Both attachedTabs and heldInputs must explicitly exist as arrays and both must
be empty; absent/wrong-type fields fail closed. Runtime.evaluate is a fixed read
of those array flags/counts, with
allowUnsafeEvalBlockedByCSP:false, no userGesture/disableBreaks or authorization
read. Worker debugging may affect idle termination; no worker crash/idle recovery
claim is made. This observer's actual Chromium behavior remains untested.

## Host success and failure cleanup

Original installed CLI profile-boot-C14i-8IN.js261–269 awaits root fiber dispose
and proxy dispose. Its307–310 provideCmdline exit function calls original
shutdown.shutdown(code). Original dsh-cmdline/lib/index.js27–31 publishes that
function as ctx.appExit. Success uses **that actual appExit(0)**, requested through
an owned local fixture file watcher; no new production RPC or replacement
shutdown implementation is registered. shutdown-observer.mjs passively preserves
the original disposer Promise and records its fulfillment, original service
leaseCount positive→0, natural beforeExit and actual exit; any process.exit call
is recorded as a forced/failed outcome. This also distinguishes CLI's5s timeout
or rejection path, which can otherwise exit0. Original OpenCU shared.mjs168–186
only clears its last lease after computers/presentation/runtime/preferences/history
have settled; failed release retains that lease and rejects disposal.

Success additionally requires original native tool call/result settlement,
zero observed pending input commands, actual child exit0/no signal/close and
original ownership monitor observing every Host member retired without errors
or forced-stop. Only after Host release/disposal may B be reattached for actual
Browser.close; A must also exit naturally. PW browser.close transport disconnect
never proves raw process exit. f.stop/ProcessMonitor.stop are failure/resource
cleanup only, not Host success evidence. Forced or unknown cleanup cannot pass.

Node test context.signal and one absolute deadline are propagated to harness,
journey, HTTP and bounded waits. No action is raced against timeout then left
free-running. Abort invokes existing owners to disconnect/settle pending PW/CDP
work, guards every next submit/click/recover and enters original failure cleanup.
Original failures and cleanup errors are preserved together. An owner that
cannot settle an operation cannot claim success; the platform deadline is no
cleanup proof. Lifecycle and passive observer integration still need independent
review and one separately approved actual run. No Host/browser/pairing was run
to implement or validate this package.

## Explicit local candidate entry

`local-harness.mjs` provides a separate local entry for the current integrated
candidate. It shares the actual package installation, original ToolRuntime,
read-only/ask policy, loopback sandbox, original extension Allow, distinct A/B
owners, detached B transport, passive worker evidence, cancellation/release and
natural Host/browser shutdown checks with the hosted lane. It never sets or
impersonates GitHub runner variables. `harness.mjs` keeps its original hosted
image, reviewed PR75 product/client hash, official browser cache owner and
installation-evidence checks.

Prepare a complete rc.2 product tgz after reviewing the current integrated
source/build/package contents. Review its actual archive SHA and the archive's
`lib/client.js` SHA independently; a local input manifest records the chosen
candidate and is not itself an independent review. The product must include its
actual extension ZIP and `src/extension/distribution.json`. All ZIP members must
exactly match that distribution's names and SHA256 values, with no duplicate or
unsafe names. CI retains its fixed 18-member check; local permits the candidate's
explicit distribution of 1–128 members.

Use the installed Playwright **1.63.0** with its supported Chromium revision
**1243 / 153.0.8010.12**, a nonroot macOS arm64 account, Node >=22.19, Python3,
Git and a complete compatible **DSH 0.2.1-rc.2 CLI**. Browser installation is a
separate preparation step; this runner downloads neither browser nor dependencies.
Provide the actual executable SHA after inspecting its provenance. The runner
rechecks the executable bytes and `--version`. It preserves browser security
and all owner checks. Remove download/proxy/trust overrides and NODE_OPTIONS
from this process before invocation, as required by both lanes. Every discovery
port 19390–19399 must be available; an unrelated current DSH occupying any of
them is a hard failure, not permission to stop it.

Create a private local manifest (all paths absolute; hashes are real lowercase
64-digit SHA256 values):

```json
{
  "schemaVersion": 1,
  "productTgz": "/absolute/reviewed-current-candidate.tgz",
  "productSha256": "<actual archive SHA256>",
  "clientSha256": "<actual lib/client.js SHA256 from that archive>",
  "dshCli": "/absolute/rc2/node_modules/@deepseek-ai/dsh-cli/bin/dsh.mjs",
  "output": "/absolute/private/web-cu-evidence",
  "browserExecutable": "/absolute/chromium-1243/Chrome.app/Contents/MacOS/Chrome",
  "browserExecutableSha256": "<actual browser executable SHA256>"
}
```

From the OMD checkout, launch exactly one real journey:

```sh
OMD_WEB_CU_REVIEWED_HARNESS="$PWD/test/fixtures/web-cu/local-harness.mjs" \
OMD_WEB_CU_LOCAL_INPUTS="/absolute/private/web-cu-inputs.json" \
node --test test/web-cu-session.test.mjs
```

The local manifest's `productTgz`, `dshCli` and `output` supply their lane's inputs;
the CI product environment variables cannot replace them. Evidence explicitly
records `acceptanceMode: "local-candidate"` plus the chosen product/browser
hashes. Missing manifest, wrong bytes/version/platform, failed assertions or
incomplete cleanup fail. A local pass establishes this candidate's local
acceptance only; it is not a hosted-CI pass, release, deployment, rc.1 or Windows
acceptance. Its retained external browser cache is neither owned nor deleted;
`cacheRemoved:false` remains accurate. The independently allocated disposable
fixture profiles are removed only after all original ownership checks pass.

Local contracts (no browser/Host launch) cover the separate manifest path,
changed candidate bytes, invalid hashes/relative paths and unchanged hosted
product pins. The passive ledger records every legal original bridge method,
including discovery, selection and observation. Input/release facts remain
method-specific; unknown or repeated results and unknown methods fail closed.

## Explicit hosted CI invocation inputs

Set OMD_WEB_CU_REVIEWED_HARNESS to this package's absolute harness.mjs path;
missing module/selection is a hard failure before launch, never skip/empty green.
Also require absolute OMD_WEB_CU_PRODUCT_TGZ, matching OMD_DSH_CLI,
OMD_WEB_CU_OUTPUT outside disposable root, existing PLAYWRIGHT_BROWSERS_PATH and
OMD_WEB_CU_BROWSER_INSTALL_EVIDENCE from the locked official installation step.
No workflow is wired or triggered by this implementation. Default/core/all
scripts use an explicit file list and do not automatically discover these tests.
A bare node --test discovery would include the hard-failing integration entry.

Local verification: node --test test/web-cu-session-contract.test.mjs
 test/web-cu-lifecycle-contract.test.mjs, syntax checks and static esbuild bundles.
Contracts use synthetic values/local HTTP/WebSocket only. They cannot substitute
for actual GUI, trusted browser input, pairing, attachment rendering or natural
process shutdown evidence. No production dependency or lockfile changed.

The per-instance owner is registered with the outer harness before spawn. A
startup exception (including failed internal cleanup) cannot erase that owner.
Underlying CDP attachment registers its driver before returning, and a late
success after abort is immediately disconnected and tracked to settlement.
Each owner has one closeOnce shared by natural/failure callers and single-flight
transport closers. Browser.close socket rejection is tolerated only when actual
raw exit0/no signal, close and group retirement prove natural closure. PW
transport disconnect runs in finally; other transport errors remain failures.
Cleanup uses the existing operation registry and supplied absolute cleanup
budget for browser/worker drains, Host and outer cleanup. A timeout leaves the
underlying task registered and owner/profile retained; it never proves settled.
First and cleanup errors both propagate to the entry boundary.

An idle poll loadingFailed can only be provisional after the shutdown request,
with no unacknowledged events, ledger pending0, exact session and a prior final
successful release ACK. It is classified only after original appExit/root lease
release/natural Host close prove the correct order; an event before actual
appExit, a missing result/poll response body or a late ACK cannot be excused.
Safe diagnostics emit only phase, known check/code and sorted categories, retaining
ordered first/cleanup classifications. Raw exception messages/stacks, renderer
console bodies and private paths are not emitted. Screenshot file references
are relative to the explicit evidence directory.

Synthetic contracts additionally cover refreshed stable UI structure without
pairingStatus; ignored/missing acceptance and failed/wrong-session release;
startup plus cleanup failure; late attach and concurrent single-flight close;
normal Browser.close disconnect versus nonnatural/group/transport failures;
hung/rejected cleanup and late underlying completion; missing/wrong/nonempty
storage arrays; exact endpoint, wrong worker, redirect/body loss and provisional
terminal poll proof; safe ordered diagnostics with secret/path sentinels.
These contracts do not establish an actual Mac GUI pass. Windows/WSL and rc.1
remain untested by this package.

本地候选可显式指定 `packageStore` 为已有的公开 pnpm 缓存目录，以免在真实交互时重新下载同版本依赖。它只提供包缓存，安装仍由原 DSH CLI 完成且核验实际 TGZ／客户端字节；临时 profile 不链接产品源码，清理不删除该共享缓存。
