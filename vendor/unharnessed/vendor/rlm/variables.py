"""The REPL's variables as the panel shows them: one line per name, and a
bounded preview of a value on demand.

A line never runs code the value defines: sizes come from builtin containers
and from array/frame shapes only. A preview may (a `__repr__`), so it runs off
the protocol threads, under a deadline and an output cap.
"""

from __future__ import annotations

import collections
import inspect
import itertools
import pprint
import threading
import types
from typing import Any

# A list stays a small frame: the panel shows the names the agent made, not a
# dump of the namespace.
_LIST_CAP = 200
_NAME_CAP = 100
_TYPE_CAP = 60
_VALUE_CAP = 40
_SIGNATURE_CAP = 80
_PREVIEW_LINES = 40
_PREVIEW_CHARS = 6_000
# Builtin containers are copied to at most this many elements in all before
# pprint sees them, so a huge list previews in bounded time.
_PREVIEW_BUDGET = 400
_PREVIEW_DEPTH = 4
_PREVIEW_TIMEOUT = 2.0
_SHAPE_MODULES = {"numpy", "pandas", "polars", "torch", "xarray", "jax", "jaxlib"}
_SIZED: tuple[tuple[type, str], ...] = (
    (str, "chars"),
    (bytes, "bytes"),
    (bytearray, "bytes"),
    (dict, "keys"),
    (list, "items"),
    (tuple, "items"),
    (set, "items"),
    (frozenset, "items"),
    (collections.deque, "items"),
)
_SCALARS = (bool, int, float, complex, type(None))


def _listed(name: Any, value: Any, skip: set[str]) -> bool:
    if not isinstance(name, str) or name.startswith("_") or name in skip:
        return False
    # Modules and C functions are always imported, never made.
    if isinstance(value, (types.ModuleType, types.BuiltinFunctionType)):
        return False
    # Functions and classes the agent wrote, not the ones it imported.
    if isinstance(value, (types.FunctionType, type)):
        return getattr(value, "__module__", None) == "__main__"
    # The bootstrap's stand-ins for skills that failed to import.
    return not type(value).__name__.startswith("_Unharnessed")


def _signature(value: Any) -> str | None:
    try:
        text = str(inspect.signature(value))
    except (TypeError, ValueError):
        return None
    return text if len(text) <= _SIGNATURE_CAP else text[: _SIGNATURE_CAP - 1] + "…"


def _describe(name: str, value: Any) -> dict[str, Any]:
    kind = type(value)
    type_name = "class" if isinstance(value, type) else kind.__name__
    row: dict[str, Any] = {"name": name[:_NAME_CAP], "type": type_name[:_TYPE_CAP], "rev": f"{id(value):x}"}
    if isinstance(value, _SCALARS):
        # numpy's scalars subclass these: their str is the bare number.
        text = repr(value) if kind.__module__ == "builtins" else str(value)
        if len(text) <= _VALUE_CAP:
            row["value"] = text
        return row
    if isinstance(value, (types.FunctionType, type)):
        signature = _signature(value)
        if signature is not None:
            row["signature"] = signature
        return row
    for base, unit in _SIZED:
        if isinstance(value, base):
            if kind is str and len(value) <= _VALUE_CAP and "\n" not in value:
                row["value"] = repr(value)
            else:
                row["len"] = len(value)
                row["unit"] = unit
            return row
    if kind.__module__.partition(".")[0] in _SHAPE_MODULES:
        shape = getattr(value, "shape", None)
        if shape == ():
            # A numpy scalar: its value says more than its empty shape.
            text = str(value)
            if len(text) <= _VALUE_CAP:
                row["value"] = text
        elif isinstance(shape, tuple) and all(isinstance(n, int) for n in shape):
            row["shape"] = list(shape)
            dtype = getattr(value, "dtype", None)
            if dtype is not None and kind.__name__ != "DataFrame":
                row["dtype"] = str(dtype)[:_TYPE_CAP]
    return row


def describe(ns: dict[str, Any], skip: set[str]) -> list[dict[str, Any]]:
    """One line per variable the agent made, in the order it made them."""
    rows: list[dict[str, Any]] = []
    for name, value in list(ns.items()):
        if len(rows) >= _LIST_CAP:
            break
        if not _listed(name, value, skip):
            continue
        try:
            rows.append(_describe(name, value))
        except Exception:  # noqa: BLE001 - one odd value must not hide the others
            rows.append({"name": name[:_NAME_CAP], "type": type(value).__name__[:_TYPE_CAP], "rev": f"{id(value):x}"})
    return rows


def lookup(ns: dict[str, Any], skip: set[str], name: str) -> Any:
    if name not in ns or not _listed(name, ns[name], skip):
        raise KeyError("Unknown variable")
    return ns[name]


class _More:
    """What a bounded copy leaves out, shown where it was."""

    def __init__(self, count: int | None) -> None:
        self.count = count

    def __repr__(self) -> str:
        return "…" if self.count is None else f"… {self.count} more"


def _bounded(value: Any, budget: list[int], depth: int) -> Any:
    """A copy of builtin containers small enough to format: past the budget or
    the depth, the rest is one `… N more`."""
    if isinstance(value, str):
        return value if len(value) <= 300 else value[:300] + "…"
    if not isinstance(value, (dict, list, tuple, set, frozenset, collections.deque)):
        return value
    if depth >= _PREVIEW_DEPTH:
        return _More(None)
    size = len(value)
    take = max(0, min(size, budget[0]))
    budget[0] -= take
    if isinstance(value, dict):
        out: Any = {
            key: _bounded(item, budget, depth + 1) for key, item in itertools.islice(value.items(), take)
        }
        if take < size:
            out[_More(size - take)] = _More(None)
        return out
    items = [_bounded(item, budget, depth + 1) for item in itertools.islice(value, take)]
    if take < size:
        items.append(_More(size - take))
    if isinstance(value, tuple):
        return tuple(items)
    if isinstance(value, collections.deque):
        return collections.deque(items)
    if isinstance(value, (set, frozenset)):
        try:
            return frozenset(items) if isinstance(value, frozenset) else set(items)
        except TypeError:
            # A bounded element that is no longer hashable.
            return items
    return items


def _source_line(value: Any) -> str:
    name = getattr(value, "__name__", "?")
    if isinstance(value, type):
        bases = ", ".join(base.__name__ for base in value.__bases__ if base is not object)
        head = f"class {name}({bases}):" if bases else f"class {name}:"
    else:
        prefix = "async def" if inspect.iscoroutinefunction(value) else "def"
        head = f"{prefix} {name}{_signature(value) or '(…)'}:"
    doc = inspect.getdoc(value)
    if not doc:
        return head
    lines = f'"""{doc}"""'.splitlines()
    return head + "\n" + "\n".join("    " + line if line else "" for line in lines)


def _format(value: Any) -> tuple[str, str]:
    """The preview's text, and how it reads: `text` wraps, `code` keeps its columns."""
    if isinstance(value, str):
        return value, "text"
    if isinstance(value, (types.FunctionType, type)):
        return _source_line(value), "code"
    if isinstance(value, (dict, list, tuple, set, frozenset, collections.deque)):
        bounded = _bounded(value, [_PREVIEW_BUDGET], 0)
        return pprint.pformat(bounded, width=60, compact=True, sort_dicts=False), "code"
    return repr(value), "code"


def _cap(text: str) -> tuple[str, bool]:
    lines = text.splitlines()
    truncated = len(lines) > _PREVIEW_LINES or len(text) > _PREVIEW_CHARS
    text = "\n".join(lines[:_PREVIEW_LINES])
    if len(text) > _PREVIEW_CHARS:
        text = text[:_PREVIEW_CHARS]
    return text, truncated


def preview(value: Any) -> dict[str, Any]:
    """A bounded preview of `value`, formatted on a worker thread under a
    deadline: a slow or hanging `__repr__` gives up instead of stalling."""
    outcome: dict[str, Any] = {}

    def run() -> None:
        try:
            text, style = _format(value)
            text, truncated = _cap(text)
            outcome.update(preview=text, style=style, truncated=truncated)
        except BaseException as exc:  # noqa: BLE001 - a broken __repr__ is the preview's answer
            outcome["error"] = f"{type(exc).__name__}: {exc}"[:300]

    worker = threading.Thread(target=run, name="unharnessed-preview", daemon=True)
    worker.start()
    worker.join(_PREVIEW_TIMEOUT)
    if worker.is_alive():
        raise TimeoutError("The value took too long to show")
    if "error" in outcome:
        raise ValueError(outcome["error"])
    return outcome
