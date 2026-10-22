# Usage

English | [中文](usage.zh.md)

## Rewind and undo

Click the arrow beside Copy on a user message. Confirmation shows the working directory and affected files. Stop a running session and check again before restoring. Other sessions are not stopped automatically.

The selected message and later conversation are withdrawn in place. Text, images and files return to the composer. Undo restores the previous conversation, files and composer draft. A draft edited while restoration is running is kept; refill the withdrawn content when ready. Unsent browser attachments follow the host's normal draft lifecycle.

After sending new messages, rewind those messages before undoing an earlier withdrawal. Avoid running multiple history-changing rewind plugins together.

## Shortcuts and commands

Press **Esc twice** in an idle conversation to open the native rewind list above the composer. **`/rewind`** opens the same list; **`/undo`** opens confirmation for restoring the last rewind. Commands are not sent to the model and accept no arguments. Selecting a message still requires confirmation.

The list starts with recent messages, with up to 100 per page. Search the current page or browse older history, including messages from before compaction. Opening the list reads message metadata without scanning workspace files or creating file snapshots. Closing it preserves unsent text and attachments. Messages without a file checkpoint are marked as conversation-only.

While running, double Esc keeps DSH’s Stop behavior; press it twice again after stopping to open the list. Menus, confirmations, IME composition, and terminals keep keyboard priority. Holding Esc does not count as two presses. Commands already owned by another plugin are not replaced; message buttons and the shortcut remain available.

## File coverage

Captures cover synchronous tool changes, including shell commands and same-workspace subagents. Git workspaces include tracked files and non-ignored new files; ordinary directories exclude `.git` and `node_modules`. Binary contents, additions, deletions, symlinks themselves and portable permission bits are recorded.

Restoration checks for newer file changes before starting and again after reading the backup, immediately before each replacement or deletion. Interrupted recovery uses the same checks. Ambiguous concurrent edits and changes across different workspaces are not overwritten automatically. Detached background processes, databases and remote side effects are outside file recovery. Messages from before installation, or whose snapshots expired, retain conversation-only recovery.

Conversation history is append-only. Recovery survives restart and does not call a model. Incomplete transactions retain their backups; unresolved external changes stop restoration rather than overwrite the current files.

## Storage

Plain chat creates lightweight checkpoints without scanning the project. Files are captured before tools run. Unchanged content is reused; large files use 4 MiB chunks, SHA-256 deduplication and compression where useful.

Up to 100 checkpoints and 20 undo records are retained per session. Idle session file backups expire after about 30 days. During idle time, unreferenced backups are collected and older records roll off toward a 2 GiB target covering backup content, indexes and recovery metadata. Open confirmations, incomplete transactions and the latest active recovery take priority. The target never rejects a new capture or interrupts normal tools.

This is a soft target, not a limit on the whole DSH directory. A large active recovery may exceed it; native conversation logs and temporary filesystem overhead are separate. Original host logs are not deleted. Backups live under `$DSH_HOME/rewind-plus/v1`; uninstalling retains them. Do not remove that directory during recovery.

## Update and remove

Install the new fixed Release package into the same profile and restart after active tasks finish. Remove it through the Plugins page or run:

```sh
dsh plugin --profile web remove @gulagala001/dsh-undo-plugin
```

Removal preserves existing backups. Complete any pending recovery before removing the plugin if you still need to undo a rewind. Avoid running multiple conversation-history rewind plugins together.

## Development

```sh
npm ci
npm run build
npm test
npm pack
```

Use an isolated DSH profile for development. From the installed plugin directory, `node scripts/cleanup.mjs` previews cleanup; add `--apply` to run it manually.

This release targets DSH 0.2.1-rc.2. Native installation, recovery and browser interaction were verified on macOS; Windows and Linux device workflows have not been verified.
