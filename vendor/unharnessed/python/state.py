"""Stream a bounded upstream-format checkpoint to the host, including in read-only mode."""
import asyncio
import base64
import io
import socket
import types
import tempfile
import os

# dill imports a temp-path constant. Avoid tempfile's write-probe during import
# in a read-only DSH kernel; actual writes remain confined by the OS sandbox.
if tempfile.tempdir is None:
    tempfile.tempdir = os.environ.get("TMPDIR") or (os.environ.get("TEMP") if os.name == "nt" else "/tmp")
import dill
from rlm import repl
from rlm.bash import BashHandle

MIME = "application/vnd.dsh-unharnessed.snapshot+json"
RESERVED = {"goal", "skills", "mcp", "attach_image", "attach_file", "display"}
repl._ALWAYS_SKIP.update(RESERVED)
repl._RESTORE_SKIP.update(RESERVED)


def checkpoint(namespace, max_bytes, max_variable_bytes, prune=False):
    """No disk access in the kernel: the host commits the stream atomically."""
    saved, skipped, oversized = [], [], []
    total = 0
    dill.settings["recurse"] = True

    def send(raw):
        nonlocal total
        total += len(raw)
        if total > max_bytes:
            raise ValueError("checkpoint exceeded its aggregate cap")
        for offset in range(0, len(raw), 256 * 1024):
            repl.emit({MIME: {"chunk": base64.b64encode(raw[offset:offset + 256 * 1024]).decode("ascii")}})

    send(repl._SNAPSHOT_MAGIC)
    for name in sorted(repl._list_names(namespace)):
        try:
            value = namespace[name]
            if isinstance(value, (asyncio.Future, BashHandle, io.IOBase, socket.socket, types.GeneratorType, types.CoroutineType, types.AsyncGeneratorType)):
                skipped.append({"name": name, "reason": "live process, task, stream or iterator; restart explicitly"})
                continue
            buffer = io.BytesIO()
            try:
                dill.dump(value, repl._CappedWriter(buffer, max_variable_bytes))
            except repl._SnapshotSizeLimitExceeded:
                oversized.append(name)
                skipped.append({"name": name, "reason": "exceeds per-variable cap"})
                continue
            payload = buffer.getvalue()
            encoded_name = name.encode("utf-8")
            header = len(encoded_name).to_bytes(4, "little") + encoded_name + len(payload).to_bytes(8, "little")
            if total + len(header) + len(payload) > max_bytes:
                skipped.append({"name": name, "reason": "exceeds aggregate cap"})
                continue
            send(header)
            send(payload)
            saved.append(name)
        except Exception as error:
            skipped.append({"name": name, "reason": str(error)[:300]})
    # The host commits before requesting pruning, so a failed checkpoint cannot
    # destroy a live variable. No arbitrary value is evaluated during pruning.
    repl.emit({MIME: {"complete": {"saved": saved, "skipped": skipped, "oversized": oversized, "bytes": total}}})
