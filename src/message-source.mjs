import { currentSourceName } from './legacy-identity.mjs';

// V4 sources identify their producer directly. Historical OMD archives keep
// their original messages, so the read side also understands the V3 wrapper
// and the earlier OMD source namespace.
export function sourceName(source) {
  const kind = source?.kind;
  if (kind === 'plugin' || kind === undefined) return currentSourceName(source?.plugin);
  if (kind?.startsWith('plugin:')) return currentSourceName(kind.slice(7));
  if (kind === 'system-prompt' && source.omdShadow === true) return 'oh-my-dsh:shadow';
  if (['system-prompt', 'runtime-context'].includes(kind)) return '@deepseek-ai/dsh-system-prompt';
  return ['user', 'model', 'assistant', 'tool'].includes(kind) ? undefined : kind;
}
