# OpenCU Integration

[简体中文](integration.md) · [English](integration_EN.md) · [Home](../README_EN.md) · [Usage](usage_EN.md) · [Development](development_EN.md)

OpenCU offers reusable backend/UI. Its current public entry points use DSH/Cordis and are not limited to OMD. Other hosts need model, tools, sessions, attachments, UI, and lifecycle adaptation. This guide uses public **1.3.0** exports; local 1.6.1 is not installed by these commands.

## Choose an Approach

| Goal | Entry |
| --- | --- |
| Add Computer Use to DSH | [Standalone installation](../README_EN.md#install), no code needed |
| Reuse in a plugin/workspace | `opencu/integration` and `opencu/client-source` |
| Coexist with OMD | Matching complete integration with shared runtime/registrations |
| Non-DSH/MCP | Host adaptation required; no general MCP release or standalone HTTP SDK |

## Get the Dependency

Select a fixed package for the host, not an unverified npm namesake. Alpha.1:

```sh
pnpm add https://github.com/gulagala001/opencu/releases/download/v1.3.0/opencu-1.3.0.tgz
```

rc.2:

```sh
pnpm add https://github.com/gulagala001/opencu/releases/download/v1.3.0-dsh.0.2.0-rc.2/opencu-1.3.0.tgz
```

Both are 1.3.0 with different SDKs, Chat snapshots, and lockfiles. Keep the complete package: `src`, `lib`, `native`, extension, scripts, and `vendor` resources. A single copied file is insufficient. Check the [release page](https://github.com/gulagala001/opencu/releases/tag/v1.3.0).

## Backend Entry

Actual signature: `acquireComputerUse(ctx, options = {})`, with `ctx` provided by DSH/Cordis:

```js
import { Config } from 'opencu';
import { acquireComputerUse } from 'opencu/integration';

export { Config };
export const name = 'my-computer-use-integration';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'sessionProjections', 'tools'];

export async function apply(ctx, config) {
  await acquireComputerUse(ctx, { config, namespace: 'opencu' });
}
```

`Config` is the real schema; see [Configuration](usage_EN.md#configuration). `namespace` is a configuration owner, not a new protocol. Standalone uses `opencu`; existing OMD compatibility uses `trisoul-x`.

| Option | Meaning |
| --- | --- |
| `config` | Configuration object, including dynamic host fields |
| `getConfig` | No-argument function returning current overrides |
| `namespace` | Owner's configuration area |
| `dataDir` | Runtime directory override when config has no data directory; directly points to Computer Use directory |

Schema `config.dataDir` is a base, with `computer-use/` appended. `options.dataDir` is the final directory. Avoid conflicting paths among shared owners.

The entry registers tools, HTTP/live-view services, image coordinates, and session hooks. It uses `llm`, `agents`, `sessions`, `settings`, `sessionProjections`, and `tools`; DSH still manages results/attachments. Use tools for normal work rather than depending on internal fields of returned `shared`, which are not a standalone SDK contract.

## Client Entry

`opencu/client` is a DSH module-loader build, not a normal Node ESM import. Use public source for your client:

```jsx
import { applyComputerUseClient } from 'opencu/client-source';

export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight'];

export function apply(ctx) {
  return applyComputerUseClient(ctx);
}
```

Source includes JSX, CSS, and the native Chat factory. Use DSH-compatible bundling, React, CSS handling, and loader; see `scripts/build.mjs`. It is not a script to paste into a web page.

Actual signature `applyComputerUseClient(ctx, options = {})` returns `{ ComputerEntry, ComputerPane }`. Defaults register composer entry, right pane, target references, and tool results. Workspace options:

| Option | Purpose |
| --- | --- |
| `integrated` | `true` hides duplicate standalone entry |
| `openPanel` | Function receiving panel name; Computer entry passes `'computer'` |
| `renderPane` | Render function receiving host pane props |

Components use host session, input, attachment, and pane props. Wire the actual call chain, not synthetic session IDs, preserving stop, takeover, resume, and errors.

## Sharing and Disposal

Backend shares runtime per `ctx.root`; client shares registrations per root. Shared keys also prevent duplication with two physical package copies. Each acquisition is an owner; disposal removes it, and the last disposal cleans up.

Use host lifecycle for enable/disable/removal, without closing another owner's backend. Explicit `opencu` values override `trisoul-x` on sharing. Paths allocate at startup and need restart after edits. Legacy bundle/data/extension/protocol identifiers preserve compatibility without restricting integration.

Public 1.3.0 mounts a matching Chat snapshot and switches registrations; it is more than a browser button. Check slots, configuration metadata, and lifecycle with other UI plugins. A successful standalone install is not evidence of coexistence.

![Browser result and actual tool read in a DSH session](images/showcase-integration.png)

*Actual fictional-order capture using new local OpenCU 1.6.1 work with OMD `0.2.0-rc.2.omd.0.16.0`, showing browser/DSH-session integration. It does not replace comprehensive coexistence/lifecycle validation. Public interfaces/layout follow 1.3.0 source; the unified Browser entry and public-extension takeover belong to this round's changes.*

## Tool Runtime API

`computer_use` provides `cua`; it is not another importable package. Minimal browser example inside that runtime:

```js
var tab = await cua.createBrowserTab('browser', 'https://example.com');
```

First selection returns state. Use the retained binding in the next call:

```js
await tab.getAXState();
await tab.getScreenshot();
await tab.markDeliverable();
```

Public built-in ID is `browser`; get other connection IDs from `cua.getState()` / `cua.listBrowsers()`. Actions belong to a target, such as `tab.setValue(elementId, text)`, with no `cua.click()`. Current tool instructions, approvals, and handoff state constrain execution.

Native runtime uses internal MCP transport, but there is no OpenCU general server arbitrary clients can add. A new host must implement execution, permissions, sessions/attachments, handoff, and lifecycle before claiming actual integration support.

## Validate an Integration

Check startup, target selection, observation, real actions, stop/takeover/resume, delivery, enable/disable, restart, and removal. With multiple plugins, check both load orders, configuration precedence, and surviving owners. Use isolated profiles/synthetic data. Real accounts, untested platforms, and unperformed system authorization are not passes. [Development entries](development_EN.md).
