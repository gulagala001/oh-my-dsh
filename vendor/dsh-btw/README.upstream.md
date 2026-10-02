# @jasonqq/dsh-btw-plugin

A Codex-style `/btw` command for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

`/btw <question>` answers a side question **in a sub-context seeded with the main
conversation**, and shows the answer in the chat **without ever adding it to the
main conversation's model history**. Ask "by the way…" questions freely — the
main context stays clean.

## How it works

- The command is registered through `@deepseek-ai/dsh-commands` (the same
  registry that powers `/compact`, `/goal`, `/plan`).
- The question is delegated through `ctx.subagents.start("fork", …)`. The
  `fork` provider spawns a child agent **seeded with the parent's completed
  turns**, so the side question is answered with full knowledge of the main
  conversation.
- The child's answer is returned as a plain command result. Command results are
  rendered by the UI adapter and **never enter the model history** — that is the
  "no pollution" guarantee.

## Usage

In any session composer:

```
/btw <question>
```

The answer appears as a command result card. It does not become a message the
main model sees, so you can reference it yourself without bloating the context.

## Install

The plugin ships as a Cordis plugin and plugs into any profile that mounts
`@deepseek-ai/dsh-commands` and `@deepseek-ai/dsh-subagent` (both are part of
the shipped `@deepseek-ai/dsh-base` composition).

1. Make the package resolvable from the profile, e.g. link it into the shared
   profile store:

   ```bash
   mkdir -p ~/.dsh/profiles/node_modules/@jasonqq
   ln -s "$PWD" ~/.dsh/profiles/node_modules/@jasonqq/dsh-btw-plugin
   ```

2. Add it to the profile patch layer (`~/.dsh/profiles/<profile>/cordis.patch.yml`):

   ```yaml
   - insert:
       - id: btw
         name: @jasonqq/dsh-btw-plugin
         config:
           provider: fork
   ```

   The profile patch is read at boot. In the desktop app, restart the app
   after editing it (the CLI `dsh web` runner hot-reloads its patches).

## Compatibility

| Harness (`@deepseek-ai/dsh-*`) | cordis | schemastery | Status                                                                    |
| ------------------------------ | ------ | ----------- | ------------------------------------------------------------------------- |
| `0.2.0-rc.2`                   | 4.0.4  | 3.18.4      | ✅ Verified — DSH Desktop 2.0.17, end-to-end `/btw` run (2026-10-01)       |
| `0.1.5-rc.2`                   | 4.0.2  | 3.18.2      | ✅ Verified — DSH Desktop 2.0.13, end-to-end `/btw` run (2026-09-23)       |
| `0.1.1-rc.2`                   | 4.0.1  | 3.18.1      | ✅ Verified — DSH Desktop 2.0.3                                            |

The command surface this plugin depends on — `commands.register()`,
`CommandInvocation`, `CommandResult`, `subagents.getProvider()` / `start()`,
`SubagentRun.result` / `dispose()`, `SubagentResult.output` / `stopReason` and
the five stop reasons — is unchanged across those lines. The one difference in
`0.2.0` is a tightening: `SubagentResult.output` is now `readonly
ContentBlock[]`, which this plugin's `filter`/`map` usage already satisfies.

## Configuration

| Key        | Default  | Meaning                                                                  |
| ---------- | -------- | ------------------------------------------------------------------------ |
| `provider` | `"fork"` | Subagent provider. `fork` seeds the child with the parent's completed turns (sees the main context); `spawn` starts a fully standalone child. |
| `maxDepth` | (unset)  | Optional recursion-depth cap for the child; defaults to the harness default when omitted. |

## Development

```bash
npm test
```

The tests exercise the handler with a stubbed `ctx.subagents` seam — no live
model or host is needed.

## License

MIT
