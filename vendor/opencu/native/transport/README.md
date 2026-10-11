# Audited Mach carrier

`CUMachChannel.h/.m` implements an OpenCU/DSH interoperability protocol. It is
not the Codex application's private XPC protocol or an emulation of that ABI.
The carrier sends bounded JSON metadata and, optionally, one real Mach send
right. A fence port is transferred as `mach_msg_port_descriptor_t`; JSON never
represents a port name as a transferable right.

## API and trusted setup

- `CUMachCreateNonce()` generates a 32-byte random session secret.
- `CUMachCurrentProcessIdentity(error)` reads `TASK_AUDIT_TOKEN` from the calling
  task and returns its real `pid`, `euid` and `pidVersion`. Failure returns nil.
- `CUMachListener` creates a random `io.opencu.channel.<UUID>` service name.
  Configure the helper's expected PID, effective UID, preferably its real PID
  version, a nonce, an operation allowlist and a capacity in `1...64`.
- After `startWithCompletion:` succeeds, pass the service name, nonce and both
  sides' known identities through the existing trusted process launch channel.
  The service name is an address, not a credential. Do not publish or log the
  nonce, or accept bootstrap identity/configuration from arbitrary callers.
- Configure `CUMachClient` with the listener's expected identity and the same
  nonce. Start it asynchronously, then call `sendRequestOperation:metadata:
  sendRight:timeout:completion:`. Timeout is seconds in `(0, 300]`.
- `CUMachRequestHandler`, start/request completion and transport error handlers
  run on the main queue. A listener's reply block can be called asynchronously
  from any queue and takes effect at most once. User callbacks that own their
  listener/client should capture that owner weakly.

`pidVersion = 0` explicitly requests pinning the first valid kernel audit PID
version after matching PID, effective UID and nonce. Subsequent messages must
match that pinned version. Passing a real version from the trusted launch
channel also protects the first exchange against PID reuse. A peer port death
ends the channel; opening a replacement requires a fresh carrier and nonce.
Each listener binds to the first authenticated client's real reply port and
rejects replacement reply ports, including those from the same process.

## Rights and acknowledgements

`CUMachSendRight.retainedSendRightWithPort:error:` requires a live send right in
the current task and increments its send user-reference count. It does not take
ownership of the caller's original reference. Its `port` property is borrowed;
keep the wrapper strongly alive while native code uses that name. For a separate
owned reference, `copySendRightWithError:` returns `+1`, which the caller must
release using `mach_port_deallocate`. `invalidate` and deallocation release the
wrapper's reference once. Do not concurrently invalidate a borrowed native use.

The sender keeps independent source references while sending `COPY_SEND`.
Successful send copies references into the receiver. Recoverable send failures
can pseudo-receive extra `MOVE_SEND` references; the carrier destroys those
returned references, including a copied header reply right, then releases its
independent source references. Other send failures are reported without replay
or a second destructive cleanup of a potentially partially destroyed message.

On receive, accepted references are retained before `mach_msg_destroy` releases
the original message's rights. Rejected, uncorrelated and late messages are
destroyed as well. The destination receive name in `msgh_local_port` is never
deallocated as an owned received right. A bounded descriptor-table walk checks
the buffer before libmach's destructor handles any rejected OOL/guarded types.

The listener holds a request reply send right only until one reply, deadline or
close. A deadline expires a queued main-thread handler and its fence reference.
If a handler already uses a fence asynchronously, that handler must keep its own
strong wrapper reference until the native operation finishes. Client completion
capacity remains reserved until the main queue consumes the completion, so a
busy main queue cannot accumulate unlimited successful reply rights.

Each wire message has a versioned prelude, 32-byte nonce and UUID. A client only
accepts a reply after matching kernel audit identity, nonce, UUID and operation.
Metadata is a JSON object; its full envelope is limited to 64 KiB. Operations
are limited by the caller's allowlist. Only zero or one ordinary send-right
descriptor is accepted. Header vouchers, OOL data, extra descriptors, malformed
message layouts and missing audit trailers do not reach the application handler.
Application metadata, including native context identity and geometry, must be
validated by the operation handler.
The listener remembers the latest 1024 accepted request UUIDs to reject duplicate
dispatch within that bounded window; this is not an operation replay mechanism.

A request timeout is an error even if the remote operation already ran. A send
success is not an operation acknowledgement. The carrier neither manufactures
prepare/complete/detach acknowledgements nor treats transport loss as evidence
that a native provider was destroyed. Such lifecycle evidence belongs to the
application protocol carried by the metadata.

## Lifecycle and platform limits

All receive loops, zero-timeout sends, deadlines, registration and lookup run on
an independent serial dispatch queue. Receive draining is limited to 64 messages
per dispatch event so close/deadline work can run. Receive rights are destroyed
only after dispatch's receive-source cancellation completes. A retained peer
send right remains valid until its death-watch cancellation completes, avoiding
port-name reuse while the watch is still installed. Internal source/deadline
handlers use weak context references.

`close` is asynchronous and fails pending requests. It attempts to remove the
dynamic bootstrap binding; an unregister failure reaches the error handler and
the receive right is still destroyed. Close is not a native detach or provider
destruction acknowledgement.

The macOS SDK still declares and links `bootstrap_register`, but marks it
deprecated. Apple documents restrictions on registering into bootstrap domains
and recommends directly passing send rights for new dynamic-name designs. This
carrier currently uses the explicitly requested random-name registration, with
no LaunchAgent installation or system configuration changes. Registration and
lookup failures are explicit errors. Successful compile/link does not prove
registration is permitted in a particular host's sandbox/bootstrap domain.

This implementation was checked against the local macOS SDK and Apple's public
sources:

- [Mach message structures, dispositions and trailers](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/mach/message.h)
- [libmach destruction and recoverable send cleanup](https://github.com/apple-oss-distributions/xnu/blob/main/libsyscall/mach/mach_msg.c)
- [Kernel pseudo-receive copyout](https://github.com/apple-oss-distributions/xnu/blob/main/osfmk/ipc/ipc_kmsg.c)
- [Bootstrap registration contract and deprecation](https://github.com/apple-oss-distributions/launchd/blob/main/liblaunch/bootstrap.h)

Compile/link check, without executing or sending messages:

```sh
clang -fobjc-arc -fblocks -Wall -Wextra -Werror -dynamiclib \
  native/transport/CUMachChannel.m -framework Foundation -lbsm \
  -o /tmp/opencu-cumach-channel.dylib
```

Real cross-process delivery, bootstrap permission, message-port death and fence
application are not runtime-verified by this compile/link check.
