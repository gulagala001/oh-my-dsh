import { extractConversationFromPage } from '../src/client/extraction.mjs';
import { pageStatus, pageCommand } from '../src/client/native-chat-bridge.mjs';
import { temporaryPageCommand } from '../src/client/temporary-web.mjs';

// Import authored functions in Node, before esbuild transforms their bodies.
// Runtime bundles carry inert source strings, independent of naming helpers.
export const pageScriptDefines = Object.fromEntries(Object.entries({
  __DSWB_EXTRACT_SOURCE__: extractConversationFromPage,
  __DSWB_STATUS_SOURCE__: pageStatus,
  __DSWB_COMMAND_SOURCE__: pageCommand,
  __DSWB_TEMPORARY_SOURCE__: temporaryPageCommand,
}).map(([name, fn]) => [name, JSON.stringify(fn.toString())]));
