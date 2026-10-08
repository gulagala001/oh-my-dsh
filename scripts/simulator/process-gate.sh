#!/bin/sh
# The external runner verifies ownership before allowing a tool to execute.
# Native synchronous spawn waits for this shell too; this registration keeps
# the parent alive until its child's identity has been checked externally.
printf '{"type":"process/gated","pid":%s,"parentPid":%s,"file":"gate","detached":false}\n' "$$" "$PPID" >&9
kill -STOP "$$"
exec "$@"
