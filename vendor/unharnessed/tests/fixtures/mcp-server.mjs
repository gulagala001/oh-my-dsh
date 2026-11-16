import { createInterface } from 'node:readline'
const tools = [
  { name: 'add', description: 'Add two fixture numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'], additionalProperties: false } },
  { name: 'long.name/with punctuation'.repeat(4), description: 'Long raw identity fixture', inputSchema: { type: 'object', properties: {} } },
  { name: 'failure', description: 'Synthetic server failure', inputSchema: { type: 'object', properties: {} } },
  { name: 'wait', description: 'Cancellation fixture', inputSchema: { type: 'object', properties: {} } },
]
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (request.id === undefined) continue
  if (request.method === 'initialize') reply(request.id, { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1.0.0' } })
  else if (request.method === 'tools/list') reply(request.id, { tools })
  else if (request.method === 'tools/call') {
    const name = request.params.name
    if (name === 'wait') { setTimeout(() => reply(request.id, { content: [{ type: 'text', text: 'late' }] }), 30000).unref(); continue }
    const value = name === 'add' ? request.params.arguments.a + request.params.arguments.b : name
    reply(request.id, { content: [{ type: 'text', text: String(value) }], ...(name === 'failure' ? { isError: true } : {}) })
  } else if (request.method === 'ping') reply(request.id, {})
  else process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Method not found' } }) + '\n')
}
