// Only these coordinate-free plugin sources are admitted at the frozen V2
// migration seam. Unknown kinds, fields and shapes retain the host's refusal.
const shapes = new Map([
  ['dream-command', {}],
  ['instruction-hint', { form: value => value === 'hint' }],
  ['agent-teams-command', { goal: value => typeof value === 'string', profile: value => typeof value === 'string' }],
]);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const compatible = source => object(source) && shapes.has(source.kind)
  && Object.entries(source).every(([key, value]) => key === 'kind'
    || Object.hasOwn(shapes.get(source.kind), key) && shapes.get(source.kind)[key](value));

// Visit only message-source owners, never quoted text, arguments or attachments.
function mapMessages(event, map) {
  const data = event.data;
  if (!object(data)) return event;
  if (event.type === 'user/message') return { ...event, data: map(data) };
  if (['assistant/message', 'tool/result'].includes(event.type) && object(data.message))
    return { ...event, data: { ...data, message: map(data.message) } };
  const key = event.type === 'agent/inbox/spliced' ? 'inserted' : event.type === 'session/title-llm-request' ? 'messages' : null;
  if (key && Array.isArray(data[key])) return { ...event, data: { ...data, [key]: data[key].map(message => object(message) ? map(message) : message) } };
  return event;
}

export function hasLegacyPluginSources(events) {
  return events.some(event => {
    let found = false;
    mapMessages(event, message => { found ||= compatible(message.source); return message; });
    return found;
  });
}

export function legacyPluginSourceMigration(native, onSourceEvent) {
  return { ...native, createStage(input) {
    const stage = native.createStage(input);
    const transformEvent = (event, context) => {
      const originals = new Map(), occupied = new Set();
      mapMessages(event, message => { if (message.source?.kind === 'plugin') occupied.add(message.source.plugin); return message; });
      let serial = 0;
      const normalized = mapMessages(event, message => {
        if (!compatible(message.source) || typeof message.id !== 'string') return message;
        let plugin;
        do { plugin = 'omd:legacy-source:' + serial++; } while (occupied.has(plugin));
        originals.set(plugin, message.source);
        return { ...message, source: { kind: 'plugin', plugin } };
      });
      if (!originals.size && !onSourceEvent) return stage.transformEvent(event, context);
      // The native stage still owns chronology, inherited cuts, event/content
      // validation and every sequence remap. Restore the exact source before
      // the next stage or relationship validator sees the output.
      stage.transformEvent(normalized, {
        emitEvent: output => {
          // V2 has no system/message source events. Its generated system head
          // must not replace the source event's own coordinate in sidecars.
          if (output.type !== 'system/message') onSourceEvent?.(event, output.seq);
          context.emitEvent(mapMessages(output, message => {
            const source = message.source?.kind === 'plugin' && originals.get(message.source.plugin);
            return source ? { ...message, source } : message;
          }));
        },
        emitRun: run => context.emitRun(run),
      });
    };
    return {
      get headerInheritedEventCount() { return stage.headerInheritedEventCount; },
      transformEvent,
      transformRun(run, context) { for (const event of run.expand()) transformEvent(event, context); },
      finish(context) { return stage.finish(context); },
    };
  } };
}
