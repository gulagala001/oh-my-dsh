# Official rc.2 desktop Deny acceptance (Issue #64, partial)

The unchanged `desktop-host-boot.test.mjs` remains a separate zero-model test.
`desktop-deny.test.mjs` installs the same final, hash-frozen complete OMD tgz
in a new independent profile, quits naturally, and restarts the official app.
The existing app/ASAR/SDK/client and installed package identity checks remain.
The workflow still gates all 613 packed vendor members and helper mode 0755.

Only the physical backend is synthetic. Its sole target has an executable
sentinel which does not exist in the owned temporary tree, without a PID or
window. The test observer acquires the public root OpenCU service with the
`opencu` configuration namespace before controller startup. All four real
backend flags remain false. In particular, `extensionEnabled:false` skips
pairing-store initialization and extension backend construction, so no
extension transport can expose `extensionRequest` and create the bridge
listener or `extension-connection.json`. The production runtime still makes
an in-memory random token internally; this fixture neither intercepts nor
replaces it, and it cannot persist without the disabled extension branch.
Both `extension-connection.json` and `extension/browser-pairings.json` must
remain absent before Deny, after Deny and at natural process exit. The existing controller lock must be absent; the
first real targets request must call the synthetic `listTargets` and return
exactly that target. These checks reject late injection even though native
and dataDir are not part of the production reconfiguration key. The fixture
never reconfigures a live controller to repair injection. Only listTargets,
applicationMetadata, release and close succeed; select, verify, observe, act,
focus and preview count and throw, and all must remain at zero through exit.

The public SessionController creates the actual `trisoul-x` Session. Its
returned id arms a global prepend `llm/stream` guard: exact Session/provider/
model, official Agent-loop marker, absent purpose, at most two requests.
Allowed requests call `next()` and traverse the official pi-ai
openai-completions adapter. The only model endpoint is a random loopback SSE
server using the explicit fake `DESKTOP_HOST_FIXTURE=local-test-only` value.
The first response emits a single fixed `opencu_select`; the second response
is permitted only after the same callId's genuine declined result appears in
the adapter's actual tool history. It then emits ordinary stop text. The
real title-LLM row and OMD background features are disabled in the temporary
profile. No Agent/pre-step hook, tool body or result producer is replaced.

The test waits for one pending request, an empty approved-app list and absent
approval files. The pinned standard Desktop layout folds its ChatGroupSeat by
default, leaving the pending approval card hidden. This is an unresolved
production UX/discoverability gap. The acceptance records
`defaultApprovalVisible=false` and `manualGroupExpansion=true`; it does not
change ui-chat, DOM/React state, default preferences or permissions. It finds
the unique real call by data-chat-call-id, the unique containing process group,
and its visible normal toggle. aria-controls must match that group's unique
process body id. Only aria-expanded=false receives a normal click; the result
must be true and the same tool's unique approval surface must become visible.
The same pending request, one model request and zero physical operations are
rechecked before and after expansion. Real collapsed/expanded screenshots are
saved before Deny or failure cancellation. Failure capture precedes cleanup
cancellation. It locates the actual open-shadow REA approval surface and
exact application title, screenshots it, and clicks the real Deny button.
It only observes the resulting authenticated response; it never sends an
approval response itself or edits React/DOM state. The response evidence is
`host-http`, from the public authenticated `connection/request` waterfall.
The real pending id is taken from the existing read-only Host inspection.
The fixture temporarily wraps only the armed POST /api/opencu request's emit,
copying data events the original consumer already causes, without adding a
data listener or calling read/resume/pause/pipe. It immediately returns the
original next result; no body is replaced or replayed. Only the exact current
Session/request decline/persist:null is retained. Other method/session buffers
are discarded and no headers, cookies or tokens enter the report.

Only after that exact request is parsed are response write/end wrapped. Each
original method gets the same receiver, arguments and callbacks and returns
or throws unchanged; false/drain semantics are retained. Private copies are
bounded before allocation. A receipt requires response finish, request
complete/readableEnded and response writableFinished, not merely next()
resolution. Abort, close-before-finish, malformed/oversize data and duplicate
responses fail observation. Original own-property descriptors are restored;
prototype methods lose the temporary own property. All observer listeners and
wrappers are also removed on fixture disposal. Real Node HTTP contracts cover
these cases, including a downstream async delay before body consumption.

The source-level hook/bridge analysis uses public source 687f282 as interface
evidence. It does not establish byte-for-byte equivalence with the packaged
shell releaseCommit 332895e. New fixed-head Windows/macOS runtime evidence is
still required; renderer requestfinished is not claimed as the producer. The settled request id
and Session must match. The card disappears; selected targets and grants
remain empty; both approval files remain absent. OpenCU activity must report
APP_ACCESS_DENIED, and the official Session's tool result must be isError
with the real denial text (toolCallId/source correlate it; Error.code need
not survive the SDK). One turn ends naturally completed, with exactly two
local model requests and one tool call. A session-specific cancellation is
failure cleanup only and cannot pass the report gate.

Synthetic unit contracts run without Electron on Linux and on each Desktop
runner. They test the guard, SSE framing/history validation, late injection,
and the real controller/official ToolRuntime denial boundary. A unit-only
public approval response drives that contract; its explicitly synthetic
Session envelopes exercise negative acceptance predicates and are never UI
or Agent completion evidence. The separate real Electron test and strict
TAP/report gate are the only desktop acceptance evidence.

HOME, DSH_HOME, profile, caches and userData are exclusive and temporary.
The app inherits the existing credential-free allowlist, never GitHub tokens
or real provider/account settings. Normal Playwright/OS sandbox protections
remain enabled. As in the existing host boot, native OS home/log metadata
is observed and default shell log effects are limited to disposable hosted
runners; renderer routing is not process-wide network isolation. No Linux
GUI, real application, helper permission request, Allow case, Web/WSL export,
release or user computer is exercised. This partial Deny evidence alone does
not close Issue #64.
