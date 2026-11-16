import asyncio
from rlm import bash as _dsh_bash, host_request as _dsh_request
import os as _dsh_os
import state as _dsh_state
import base64 as _dsh_base64
import mimetypes as _dsh_mimetypes
from pathlib import Path as _DshPath


def bash(command, timeout=600):
    # Missing shell affects shell calls only. Check before creating a background
    # handle, and never fall back to a cell-controlled PATH or inherited shell.
    if not _dsh_os.environ.get("UNHARNESSED_BASH_SHELL"):
        raise RuntimeError(_dsh_os.environ.get("DSH_UNHARNESSED_SHELL_ERROR") or
                           "No POSIX shell is configured. Set bashCommand to an absolute shell path and reset the Python kernel.")
    return _dsh_bash(command, timeout=timeout)


class _Goal:
    """DSH's persisted, same-session goal, accessible through the one tool."""
    async def get(self):
        return await _dsh_request("dsh.goal", {"action": "get"})

    async def complete(self):
        return await _dsh_request("dsh.goal", {"action": "complete"})

    async def block(self, reason):
        return await _dsh_request("dsh.goal", {"action": "block", "reason": reason})


class _Skills:
    async def list(self):
        return await _dsh_request("dsh.skills", {"action": "list"})

    async def get(self, name):
        return await _dsh_request("dsh.skills", {"action": "get", "name": name})


goal = _Goal()
skills = _Skills()


class _Mcp:
    async def list_connections(self):
        return await _dsh_request("dsh.mcp", {"action": "list_connections"})

    async def list_tools(self, server=None):
        return await _dsh_request("dsh.mcp", {"action": "list_tools", "server": server})

    async def search_tools(self, query, server=None, limit=20):
        return await _dsh_request("dsh.mcp", {"action": "search_tools", "query": query, "server": server, "limit": limit})

    async def describe_tool(self, server, tool):
        return await _dsh_request("dsh.mcp", {"action": "describe_tool", "server": server, "tool": tool})

    async def call_tool(self, server, tool, arguments=None):
        return await _dsh_request("dsh.mcp", {"action": "call_tool", "server": server, "tool": tool, "arguments": arguments or {}})


def _dsh_file_item(path):
    file = _DshPath(path)
    with file.open("rb") as stream:
        data = stream.read(_dsh_attachment_limit + 1)
    if len(data) > _dsh_attachment_limit:
        raise ValueError("Attachment exceeds the configured byte limit")
    return {"name": file.name, "data": _dsh_base64.b64encode(data).decode("ascii")}


async def attach_image(*paths):
    items = []
    for path in paths:
        item = _dsh_file_item(path)
        item["mediaType"] = _dsh_mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        items.append(item)
    return await _dsh_request("dsh.media", {"action": "images", "items": items})


async def attach_file(*paths):
    return await _dsh_request("dsh.media", {"action": "files", "items": [_dsh_file_item(path) for path in paths]})


async def display(data, name="output"):
    """Publish a MIME bundle; binary values are bytes or canonical base64."""
    for media_type, value in data.items():
        if media_type == "text/plain":
            print(str(value))
            continue
        if isinstance(value, bytes):
            value = _dsh_base64.b64encode(value).decode("ascii")
        elif media_type.startswith("text/") or media_type == "application/json":
            import json
            text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
            value = _dsh_base64.b64encode(text.encode("utf-8")).decode("ascii")
        extension = _dsh_mimetypes.guess_extension(media_type) or ".bin"
        item = {"name": name + extension, "data": value, "mediaType": media_type}
        action = "images" if media_type in {"image/png", "image/jpeg", "image/webp", "image/gif"} else "files"
        await _dsh_request("dsh.media", {"action": action, "items": [item]})


mcp = _Mcp()
