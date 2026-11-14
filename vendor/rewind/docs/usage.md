# DSH Rewind usage guide

[简体中文](usage.zh.md) · [Back to README](../README_EN.md)

## Rewind and undo

Click the rewind arrow next to the copy button on one of your messages. The dialog shows the working directory and the files that will change. Confirming automatically stops the current conversation before rewinding; other conversations are not affected.

After you confirm, that message and everything after it are removed, and its text, images and files go back into the composer. **Undo rewind** brings back the conversation, the files and the draft you had at the time. A draft you write in the meantime is not overwritten.

The task list returns to the same point too, including completion state, your original wording and verification notes. Rewinding to before the first task clears the list.

If you sent a new message after rewinding, rewind that message first, then undo the earlier rewind. Do not enable another plugin that rewrites conversation history at the same time.

## Shortcuts and commands

| Action | Effect |
| --- | --- |
| Press **Esc** twice while the conversation is idle | Open the rewind list |
| `/rewind` | Open the same list |
| `/undo` | Undo the most recent rewind (asks for confirmation first) |

These commands are not sent to the model and take no arguments. The list starts with the latest message, shows up to 100 per page, can be searched, and goes back past compaction. Messages without a file backup are marked "conversation only". Opening the list does not scan files, and closing it keeps your draft and attachments.

While a reply is generating, double Esc still stops DSH as usual; press it twice again afterwards to open the list. Menus, dialogs, input methods and the terminal handle their own keys first, and holding Esc does not count as a double press. If another plugin already owns `/rewind` or `/undo`, this plugin leaves it alone; the message button and the shortcut still work.

## Which files are backed up

Before and after every AI tool call, the plugin records file changes in the working directory, including synchronous commands and subagents working in the same directory.

- Git repositories: tracked files and new files not ignored by `.gitignore`.
- Other directories: everything except `.git`, `node_modules` and temporary browser profiles.
- Binary files, creations, deletions, symlinks themselves and the executable bit are recorded.

Temporary browser profiles, caches and lock files are excluded. Screenshots, pages and other project files are still recorded.

Before restoring, the plugin checks whether files changed in the meantime, and checks again before replacing each file. Conflicting files, missing backups and unavailable files are left in place while the conversation rewinds. Undo also preserves new file edits. Background processes that run outside a tool call, databases and remote operations are not covered.

Restoring does not call the model, and the result survives restarts. The original DSH conversation log is only appended to, never deleted. If a restore is interrupted, its backup is kept so it can finish later.

## Storage

| Item | Rule |
| --- | --- |
| Backup location | `$DSH_HOME/rewind-plus/v1`, kept on uninstall |
| Per conversation | Up to 100 checkpoints and 20 undo records |
| Expiry | File backups of idle conversations are cleaned up after about 30 days |
| Space target | When idle, total usage is trimmed toward about 2 GiB, oldest records first |
| Write limit | Backup content is capped at 4 GiB by default; new backups pause at the cap |
| Free disk | New backups pause when less than 512 MiB is free |

Chat-only turns create tiny checkpoints and do not scan the project. Unchanged files reuse existing backups, and large files are split into 4 MiB chunks, deduplicated and compressed when useful.

Each automatic backup gets at most 4 seconds; after a timeout the same directory is retried 30 seconds later. When a backup times out, runs out of space or hits the write limit, changes from that period are not backed up, and rewinding keeps those files in place and restores the conversation. The AI keeps working normally.

2 GiB is a cleanup target, not a hard cap. Backing up a large project can push usage above it for a while until idle cleanup brings it down. Do not delete the backup directory by hand while a restore is in progress.

## Update and uninstall

To update, install the new package in the same profile and restart DSH after your task finishes. To uninstall, remove it on the Plugins page or run:

```sh
dsh plugin --profile web remove @gulagala001/dsh-undo-plugin
```

Uninstalling keeps existing backups. If you still want to undo an earlier rewind, do it before uninstalling.

## Development

```sh
node scripts/prepare-host-sdk.mjs
npm ci
npm run build
npm test
npm pack
```

Use a separate DSH profile for development. In the install directory, `node scripts/cleanup.mjs` previews a cleanup; add `--apply` to run it.
