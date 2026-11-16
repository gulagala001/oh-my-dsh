# DSH Unharnessed

[简体中文](README.md)

Use one persistent Python tool in DeepSeek Harness for coding, background commands, MCP calls, and image and file delivery. Keep variables across context compaction and restore saved state when the same chat resumes.

## Install and select

Paste this package URL into **Plugins → Add plugin**:

```text
https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.2-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.2-dsh.0.2.2-rc.3.tgz
```

Select **Unharnessed** in a new chat. Existing chats can retain their original plugin revision; start a new chat or restart DSH normally after an update.

| Supported environment | Requirement |
| --- | --- |
| Host | DSH Desktop 0.2.2-rc.3 |
| Runtime | Node.js 24.9.0+, existing Python 3.11+ |
| Python | Uses the Desktop interpreter when available; kernel and dill are included |

Try asking it to calculate the sum of squares from 1 to 100 and save the result in a variable.

## Python and background commands

Python works without a shell. Background commands and autonomous shell checks need Bash. On Windows, install Git for Windows; default, per-user, Scoop and PATH installations are detected, and an active Git Bash plugin can supply its configured path. WSL launchers are not supported. For a custom installation, set `bashCommand` below to an absolute path such as `C:/Tools/Git/bin/bash.exe`, then use `/unharnessed-reset` or start a new chat.

```python
from pathlib import Path
source = Path('README.md').read_text()
len(source), source[:300]
build = bash('npm run build', timeout=600)
result = await build
result.exit_code, result.output[-2000:]
```

Top-level await, trailing expressions, variables, functions and async tasks persist between cells. Shell handles expose pid, running, command, tail(), output(), poll(), kill() and await. An unconsumed background completion wakes the chat after the current turn. Reading its output withdraws a stale completion notice. Shell timeouts use seconds; timeout=None removes that command's deadline.

## Checkpoints across restarts

Completed cells and normal kernel shutdown save serializable state. The same chat can restore variables, functions and lambdas after restart or kernel failure. Read the restoration notice for skipped values.

- Defaults: 16 MiB per value, 256 MiB per checkpoint. Oversized or unserializable values are listed.
- Running processes, shell handles, tasks, streams, sockets and generators need to be started again.
- Restoration requires the same chat ID, workspace, permission policy and Python major/minor version. Forks and changed environments start fresh.
- `/unharnessed-reset` stops the kernel and clears that chat's checkpoint.
- `/compact` keeps the running kernel and reports remaining names. Oversized values are pruned only after a successful checkpoint.
- Checkpoints use private files and ownership locks in the profile's `unharnessed-state` directory. Integrity checks run before restoration. Read-only sessions can save kernel state without expanding workspace write access.

Restoration does not rerun old cells. Changes since the last successful checkpoint can be lost after an abrupt shutdown.

## DSH MCP

Use connections already configured in DSH:

```python
await mcp.list_connections()
await mcp.search_tools('search', limit=10)
await mcp.list_tools('server')
await mcp.describe_tool('server', 'tool')
result = await mcp.call_tool('server', 'tool', {'query': 'example'})
```

Use discovered public names or the server's original names. Long names follow DSH's hashed naming. Results return as Python values; images and files also enter the chat. DSH argument checks, scoped restrictions, guards, approvals, cancellation and result handling apply. Manage connections and authentication in DSH. The tool catalog is empty when no connections are available.

## Images, files and rich output

```python
await attach_image('plot.png', 'screenshot.jpg')
await attach_file('report.pdf', 'clip.mp4', 'recording.wav')
await display({'text/html': '<h1>Report</h1>'}, name='report')
await display({'image/png': Path('plot.png').read_bytes()})
```

PNG, JPEG, WebP and GIF images use DSH's image storage and validation. Generic files retain their original bytes. Audio and video are delivered as files; previews depend on DSH. HTML is a downloadable file. `display()` accepts MIME dictionaries with bytes or canonical base64 for binary data and text for text MIME types. `rlm.emit()` also supports image, text and file MIME output.

Files are read relative to Python's current directory under its sandbox. Each attachment request defaults to a 10 MiB total limit. Attachment references persist in the chat. Generated media is labeled as tool output so it can be distinguished from new human input.

## Goals and autonomous checks

```text
/goal Fix the parser, run tests and check boundary inputs
/goal pause
/goal resume
/goal clear
```

```python
await goal.get()
await goal.complete()
await goal.block('reason')
```

Goals use DSH's persisted continuation. Python cannot create or resume a human goal; blocking requires at least three goal rounds.

```text
/unharnessed-autonomous {"objective":"Accept trailing commas","gates":["npm test","npm run lint"],"maxRounds":12}
```

After a turn and its background commands finish, DSH runs the configured shell checks. All must pass before completion; failures continue until the round limit. goal.complete() cannot bypass these checks. Use native pause, clear or stop controls. Limits count DSH rounds. Checks use the DSH workspace and host environment, not Python's temporary cwd or environment.

## Skills and configuration

```python
await skills.list()
await skills.get('skill-name')
```

Configure the `unharnessed` plugin in `cordis.patch.yml`. Time settings use milliseconds.

| Setting | Default | Purpose |
| --- | --- | --- |
| pythonCommand | auto | Existing Python executable |
| bashCommand | bash | Discover Bash or use an explicit absolute path |
| maxOutputChars | 16000 | Cell text limit |
| cellTimeoutMs | 600000 | Cell deadline |
| startupTimeoutMs | 15000 | Kernel startup deadline |
| interruptGraceMs | 3000 | Grace period before forced termination |
| gateTimeoutMs | 60000 | Deadline per check command |
| snapshots | true | Checkpoint and restore state |
| stateDirectory | empty | Use profile state directory |
| snapshotMaxBytes | 268435456 | Total checkpoint limit |
| snapshotVariableBytes | 16777216 | Per-value checkpoint limit |
| snapshotTimeoutMs | 15000 | Checkpoint deadline |
| maxAttachmentBytes | 10485760 | Total bytes per attachment request |

## Development and licenses

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and checks, and [CHANGELOG.md](CHANGELOG.md) for changes. This plugin uses [MIT](LICENSE). Runtime and dill sources and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
