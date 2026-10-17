import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export const promptText = '验证桌面插件';
export const replyText = '桌面适配验证完成。';
export const chatText = '验证原生桌面聊天';
export const chatReply = '原生桌面聊天已保存。';
export const verificationFile = "desktop's verification.mjs";
export const verificationMarker = 'NATIVE_DESKTOP_VERIFIED';
const textOf = message => typeof message.content === 'string' ? message.content : (message.content ?? []).map(part => part.text ?? '').join('\n');

// A loopback model server requests the real installed tools. It neither returns
// invented tool results nor substitutes any DSH service/tool/persistence backend.
export async function localProvider() {
  const payloads = [], errors = [];
  const calls = [
    ['todo_write', { op: 'excerpt', from: promptText, to: promptText, tasks: [{ title: promptText, anchor: { from: promptText, to: promptText } }] }],
    ['verify_link', { op: 'link', links: [{ task: 'T1', kind: 'test', path: verificationFile }] }],
    ['verify_link', { op: 'run', tasks: ['T1'] }],
    ['todo_write', { op: 'check', updates: [{ id: 'T1', done: true }] }],
  ];
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.method, 'POST');
      let body = ''; for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body); payloads.push(payload);
      let reply = { delta: { role: 'assistant', content: '验证桌面插件' }, finish_reason: 'stop' };
      if (payload.tools?.length) {
        const offered = payload.tools.map(tool => tool.function.name);
        assert(!offered.includes('computer_use'), 'Non-CU model must not receive computer_use');
        const lastUser = payload.messages.findLast(message => message.role === 'user' && [promptText, chatText].includes(textOf(message)));
        if (lastUser && textOf(lastUser) === chatText) reply.delta.content = chatReply;
        else if (lastUser) {
          const sent = payload.messages.flatMap(message => message.tool_calls ?? []).filter(call => call.id.startsWith('desktop-noncu-verify-'));
          const next = sent.length;
          if (next < calls.length) {
            const [name, args] = calls[next]; assert(offered.includes(name), 'Actual installed verification tool missing: ' + name);
            reply = { delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'desktop-noncu-verify-' + next, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' };
          } else reply.delta.content = replyText;
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: ' + JSON.stringify({ id: 'desktop-noncu', object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, ...reply }] }) + '\n\ndata: [DONE]\n\n');
    } catch (error) {
      errors.push(error.message);
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, payloads, errors, origin: 'http://127.0.0.1:' + server.address().port };
}
