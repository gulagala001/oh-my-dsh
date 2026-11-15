# Workflow authoring reference

Delegate concrete work while continuing independent work. Separate discovery, implementation and integration only where the dependencies require it.

Use `pipeline` when each item can move to its next stage without the other items. For example:

```js
const results = await pipeline(args.modules,
  (_, name) => agent(`Read the interface for ${name}`),
  (spec, name) => agent(`Implement ${name} against this interface: ${spec}`))
```

Use `parallel` as a barrier when the next decision needs all results, for example to merge overlapping file assignments before editing:

```js
const findings = await parallel(args.modules.map(name => () => agent(`Review ${name}`)))
if (findings.some(value => value === null)) throw Error('Incomplete review')
return await agent(`Reconcile these findings: ${JSON.stringify(findings)}`)
```

For concurrent edits isolate conflicting files, integrate retained changes, and check actual results rather than treating a completed call as successful work. Label concurrent stages explicitly when their progress must be attributed separately. Report skipped items, failed calls and budget-limited coverage. Stop when the requested result is complete.
