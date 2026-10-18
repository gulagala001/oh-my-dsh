import { createRequire } from 'node:module';
import { realpathSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requestImageHandleText } from '@deepseek-ai/dsh-llm';
import { renderResult } from '../../../vendor/opencu/src/dsh/tools.mjs';

// Contracts only: invoke the installed public pi-ai convertMessages export.
// rc.2's private userContent is not exported: the short block mapping below
// corresponds explicitly to installed llm-pi-ai lib/index.js:1220-1245,1410.
// It is NOT a Host or provider execution substitute.
const host = createRequire(realpathSync(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/package.json'))));
const provider = host.resolve('@deepseek-ai/dsh-llm-pi-ai');
const piRoot = resolve(dirname(provider), '../../../@earendil-works/pi-ai');
const manifest = JSON.parse(readFileSync(resolve(piRoot, 'package.json'), 'utf8'));
if (manifest.version !== '1.1.0') throw Error('Wire contract requires locked pi-ai 1.1.0');
const exported = manifest.exports['./api/*'].import.replace('*', 'openai-completions');
const { convertMessages } = await import(pathToFileURL(resolve(piRoot, exported)).href);
export function encodedFollowup(scenario, phase, value, access) {
  const call = scenario.calls.get(phase), model = { id: 'ecosystem', provider: 'ecosystem', api: 'openai-completions', input: ['text', 'image'] };
  const content = renderResult(call.args, value).flatMap(block => block.type === 'text' ? [{ type: 'text', text: block.text }] : block.type === 'image' ? [
    { type: 'text', text: requestImageHandleText(block.attachment, { width: block.attachment.width, height: block.attachment.height }, access) },
    { type: 'image', mimeType: block.attachment.mediaType, data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlS0AAAAASUVORK5CYII=' },
  ] : []);
  return convertMessages(model, { messages: [
    { role: 'user', content: scenario.marker(phase), timestamp: 0 },
    { role: 'assistant', ...{ api: model.api, provider: model.provider, model: model.id }, content: [{ type: 'toolCall', id: call.callId, name: 'computer_use', arguments: call.args }], stopReason: 'toolUse', timestamp: 0 },
    { role: 'toolResult', toolCallId: call.callId, toolName: 'computer_use', content, isError: false, timestamp: 0 },
  ] }, { supportsMidConvoSystemMessages: true }, {});
}
