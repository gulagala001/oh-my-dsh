import test from 'node:test';
import assert from 'node:assert/strict';
import { markAgentLoopRequest, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { projectResponsesToolsForCommandCodeChat } from '../src/commandcode-chat-compat.mjs';

const profile = { api: 'openai-completions', baseURL: 'https://api.commandcode.ai/provider/v1' };
const image = id => ({ type: 'image', attachment: { attachmentId: id, mediaType: 'image/png', width: 10, height: 10 } });
const assistant = (api = 'openai-responses') => ({
  role: 'assistant',
  id: 'assistant-1',
  source: { kind: 'model', provider: 'cmdgoat-responses', model: 'deepseek/deepseek-v4.1-flash',
    replayState: { response: { api } } },
  content: [
    { type: 'text', text: 'I inspected the file.' },
    { type: 'tool-call', id: 'call-1', name: 'write', arguments: '{"file":"a","content":"EXACT"}' },
  ],
});
const tool = () => ({
  role: 'tool', id: 'tool-1', toolCallId: 'call-1', isError: false,
  source: { kind: 'tool' },
  content: [{ type: 'text', text: 'EXACT_RESULT' }, image('img-1')],
});
const user = { role: 'user', id: 'user-1', source: { kind: 'user' }, content: [{ type: 'text', text: 'Continue.' }] };

function request(messages = [assistant(), tool(), user]) {
  return markAgentLoopRequest(Object.freeze({
    provider: 'cmdgoat', model: 'deepseek/deepseek-v4.1-flash', messages: Object.freeze(messages),
  }));
}
test('old Responses tool history becomes alternating neutral history without mutating or losing content', () => {
  const options = request(), before = JSON.stringify(options);
  const projected = projectResponsesToolsForCommandCodeChat(options, profile);
  assert.notEqual(projected, options);
  assert.equal(isAgentLoopRequest(projected), true);
  assert.equal(JSON.stringify(options), before);
  assert.deepEqual(projected.messages.map(message => message.role), ['assistant', 'user', 'user']);
  assert.match(projected.messages[0].content.at(-1).text, /name: write/);
  assert.match(projected.messages[0].content.at(-1).text, /EXACT/);
  assert.equal(projected.messages[0].source.replayState, undefined);
  assert.match(projected.messages[1].content[0].text, /call_id: call-1/);
  assert.equal(projected.messages[1].content[1].text, 'EXACT_RESULT');
  assert.equal(projected.messages[1].content[2].attachment.attachmentId, 'img-1');
  assert.equal(projected.messages[2], user);
});

test('Chat-native tool history and unrelated routes remain exact', () => {
  const native = request([assistant('openai-completions'), tool(), user]);
  assert.equal(projectResponsesToolsForCommandCodeChat(native, profile), native);
  for (const other of [
    { ...profile, api: 'openai-responses' },
    { ...profile, baseURL: 'https://api.openai.com/v1' },
  ]) { const value = request(); assert.equal(projectResponsesToolsForCommandCodeChat(value, other), value); }
  const nonDeepSeek = markAgentLoopRequest({ ...request(), model: 'gpt-5.6-sol' });
  assert.equal(projectResponsesToolsForCommandCodeChat(nonDeepSeek, profile), nonDeepSeek);
});
test('multiple historical tool results are preserved in one neutral user turn', () => {
  const a = assistant();
  a.content.push({ type: 'tool-call', id: 'call-2', name: 'read', arguments: '{"path":"b"}' });
  const first = tool();
  const second = { ...tool(), id: 'tool-2', toolCallId: 'call-2',
    content: [{ type: 'text', text: 'SECOND_RESULT' }] };
  const projected = projectResponsesToolsForCommandCodeChat(request([a, first, second, user]), profile);
  assert.deepEqual(projected.messages.map(message => message.role), ['assistant', 'user', 'user']);
  assert.match(projected.messages[0].content.at(-1).text, /name: read/);
  assert.match(projected.messages[1].content.map(block => block.text || '').join('\n'), /SECOND_RESULT/);
  assert.equal(projected.messages[1].content.filter(block => block.type === 'image').length, 1);
});
