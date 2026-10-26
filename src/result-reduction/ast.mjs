import { compute } from '../compute.mjs';
import { structuralSearch as directSearch } from './ast-engine.mjs';
export { languages, astRuntime } from './ast-engine.mjs';

export async function structuralSearch(text, language, pattern, signal) {
  // Small inputs avoid a worker round trip. Large parses cannot stall the host.
  return text.length < 32 * 1024 ? directSearch(text, language, pattern, signal)
    : compute('ast', { text, language, pattern }, signal);
}
