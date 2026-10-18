import assert from 'node:assert/strict';
import { requestImageHandleText } from '@deepseek-ai/dsh-llm';

export const phases = ['exercise', 'cancel', 'recover'];
export function textParts(content) {
  return typeof content === 'string' ? [content] : Array.isArray(content)
    ? content.filter(part => part.type === 'text').map(part => part.text) : [];
}
// rc.2 appends this system-prompt snapshot as role=user on the provider wire.
// It is not the user's composer instruction. Keep every other user message,
// including quoted markers and the official trailing tool-image message.
export function withoutRuntimeContext(messages) {
  return messages.filter(message=>{
    if(message.role!=='user')return true;
    if(typeof message.content!=='string'&&!(Array.isArray(message.content)&&message.content.length===1&&message.content[0]?.type==='text'&&Object.keys(message.content[0]).every(key=>key==='type'||key==='text')))return true;
    const text=textParts(message.content);
    if(text.length!==1)return true;
    const parts=text[0].split('\n\n');
    return !(parts.length===6
      && parts[0]==='Current runtime context. This snapshot supersedes earlier runtime-context snapshots.'
      && /^Current working directory: "(?:[^"\\]|\\.)+"\.$/.test(parts[1])
      && /^Current DSH file policy: [^\n]+$/.test(parts[2])
      && /^Approval policy: [^\n]+$/.test(parts[3])
      && /^Current DeepSeek Harness implementation checkout: "(?:[^"\\]|\\.)+"\.$/.test(parts[4])
      && /^Current DeepSeek Harness Web GUI URL: "http:\/\/127\.0\.0\.1:[1-9]\d*"\.$/.test(parts[5])
      && !/WEB_CU:|NATIVE_APPROVAL:/.test(text[0]));
  });
}
export function toolValue(content) {
  const texts = textParts(content); assert.equal(texts.length, 1, 'One original result text block required');
  const [json, ...suffix] = texts[0].split('\n');
  const value = JSON.parse(json);
  assert(value?.ok === true && Array.isArray(value.outputs), 'One actual successful computer_use result is required');
  if (suffix.length) {
    assert.equal(suffix.length, value.images?.length, 'Only exact official image handles may follow original JSON');
    suffix.forEach((line, index) => {
      const size = /; request preview ([1-9]\d*)x([1-9]\d*)px\./.exec(line);
      assert(size, 'Official image preview dimensions required');
      const version = { width: Number(size[1]), height: Number(size[2]) };
      assert(version.width <= 16384 && version.height <= 16384);
      const path = / Normalized copy \(read-only; may be resized or re-encoded\): ("(?:[^"\\]|\\.)*") \(/.exec(line);
      const access = path ? { readonlyPath: JSON.parse(path[1]) } : undefined;
      assert.equal(line, requestImageHandleText(value.images[index], version, access), 'Unexpected tool JSON suffix');
    });
  }
  return value;
}
function imageTail(messages, images) {
  if (!messages.length) return;
  // pi-ai 1.1.0 convertMessages may add this compatibility assistant first.
  if (messages[0]?.role === 'assistant' && messages[0].content === 'I have processed the tool results.') messages = messages.slice(1);
  assert.equal(messages.length, 1, 'Only the official trailing image user is allowed');
  const message = messages[0]; assert.equal(message.role, 'user');
  assert(Array.isArray(message.content)); assert.equal(message.content.length, images.length + 1);
  assert.deepEqual(message.content[0], { type: 'text', text: 'Attached image(s) from tool result:' });
  for (const part of message.content.slice(1)) {
    assert.equal(part.type, 'image_url');
    const encoded = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(part.image_url?.url ?? '');
    assert(encoded, 'Actual image data required, not a forged image-user marker');
    const bytes = Buffer.from(encoded[2], 'base64'); assert(bytes.length > 0 && bytes.length <= 8 * 1024 * 1024);
    assert.equal(bytes.toString('base64'), encoded[2]);
  }
}
export function proofOutput(value, nonce, phase) {
  const rows = value.outputs.flatMap(text => { try { return [JSON.parse(text)]; } catch { return []; } })
    .filter(row => row?.proof === nonce && row.phase === phase);
  assert.equal(rows.length, 1, 'Missing or duplicate output from the actual CU cell');
  assert.match(rows[0].browserId, /^extension:[A-Za-z0-9_-]+$/);
  assert.equal(typeof rows[0].tabId, 'string');
  assert.equal(typeof rows[0].identity?.epoch, 'string');
  assert(Number.isInteger(rows[0].identity.tabId));
  return rows[0];
}
export function assertComputerSchema(tools) {
  const matches = (tools ?? []).filter(tool => tool.function?.name === 'computer_use');
  assert.equal(matches.length, 1, 'Native computer_use wire schema required; PTC is a separate acceptance');
  const schema = matches[0].function.parameters;
  assert.equal(schema?.properties?.code?.type, 'string');
  assert.equal(schema?.properties?.title?.type, 'string');
  assert(schema.required?.includes('code') && schema.required.includes('title'));
}

// Only model output is scripted. Every result below must come back over the
// original provider wire from the actual Host ToolRuntime and original OpenCU.
export function createWebCuScenario({ nonce, fixtureURL }) {
  assert.match(nonce, /^[a-f0-9]{32}$/);
  const url = new URL(fixtureURL);
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.protocol, 'http:');
  assert.equal(url.pathname, '/' + nonce);
  const q = JSON.stringify, calls = new Map(), receipts = new Map();
  const marker = phase => `WEB_CU:${nonce}:${phase}`;
  const code = phase => {
    if (phase === 'exercise') return `
var inventory = await cua.getState();
var candidates = inventory.browsers.filter(b => b.provider === 'extension' && !b.pairingRequired);
if (candidates.length !== 1) throw Error('Exactly one real paired extension browser required');
var webBrowser = await cua.getBrowser({id:candidates[0].id});
var webTab = await webBrowser.tabs.new(${q(fixtureURL)});
var initialAX = await webTab.getAXState({disableDiffing:true});
var unchangedAX = await webTab.getAXState();
if (!unchangedAX.includes('(no change; do not immediately repeat observation)')) throw Error('Expected actual unchanged AX diff');
if (!initialAX.includes(${q(nonce)})) throw Error('Synthetic target nonce missing');
await webTab.playwright.getByRole('textbox',{name:'Proof input',exact:true}).fill(${q(nonce + ':first')});
await webTab.playwright.getByRole('button',{name:'Record proof',exact:true}).click();
await webTab.playwright.getByText('Count 1',{exact:true}).waitFor({state:'visible',timeoutMs:10000});
var changedAX = await webTab.getAXState();
if (!changedAX.startsWith('AX diff from ') || !changedAX.includes(${q(nonce + ':first')})) throw Error('Expected actual changed AX diff');
var evidence = await webTab.getAXStateAndScreenshot({disableDiffing:true});
if (!evidence.state.includes(${q(nonce + ':first')}) || !evidence.screenshot?.attachmentId) throw Error('AX/image proof missing');
nodeRepl.write({proof:${q(nonce)},phase:'exercise',browserId:candidates[0].id,tabId:webTab.id,identity:webTab.target.identity,ax:{initial:initialAX,unchanged:unchangedAX,changed:changedAX,full:evidence.state}});`;
    const original = receipts.get('exercise');
    assert(original, 'Exercise wire receipt must precede later cells');
    const bind = `var reboundInventory = await cua.getState();
if (!reboundInventory.targets.some(t => t.id === ${q(original.tabId)} && t.browserId === ${q(original.browserId)} && t.url === ${q(fixtureURL)})) throw Error('Original target identity missing');
var reboundTab = await cua.getTab(${q(original.tabId)},{browser:${q(original.browserId)},expected:{url:${q(fixtureURL)}}});
await reboundTab.getAXState();`;
    if (phase === 'cancel') return bind + `
await reboundTab.keyDown('Shift');
await reboundTab.playwright.getByText('NEVER_VISIBLE_${nonce}',{exact:true}).waitFor({state:'visible',timeoutMs:0});
await reboundTab.playwright.getByRole('button',{name:'Record proof',exact:true}).click();
throw Error('Canceled wait resumed and dispatched late input');`;
    assert.equal(phase, 'recover');
    return bind + `
await reboundTab.playwright.getByRole('textbox',{name:'Proof input',exact:true}).fill(${q(nonce + ':recovered')});
await reboundTab.playwright.getByRole('button',{name:'Record proof',exact:true}).click();
await reboundTab.playwright.getByText('Count 2',{exact:true}).waitFor({state:'visible',timeoutMs:10000});
var recoveredEvidence = await reboundTab.getAXStateAndScreenshot({disableDiffing:true});
if (!recoveredEvidence.state.includes(${q(nonce + ':recovered')}) || !recoveredEvidence.screenshot?.attachmentId) throw Error('Recovered AX/image proof missing');
nodeRepl.write({proof:${q(nonce)},phase:'recover',browserId:${q(original.browserId)},tabId:reboundTab.id,identity:reboundTab.target.identity});`;
  };
  let requestCount = 0, activePhase;
  const arm = phase => {
    assert(phases.includes(phase)); assert(!calls.has(phase), 'Phase cannot be rearmed');
    if (phase !== 'exercise') assert(receipts.has('exercise'), 'Exercise must finish first');
    if (phase === 'recover') assert.equal(activePhase, 'cancel');
    activePhase = phase;
  };
  const respond = payload => {
    assert(++requestCount <= 48, 'Bounded model request budget exceeded');
    assert.equal(payload.model, 'ecosystem'); assert(Array.isArray(payload.messages));
    assert(activePhase, 'Journey must arm the current UI business phase');
    const phase = activePhase, callId = `web-cu-${nonce}-${phase}`, previous = calls.get(phase);
    const messages = withoutRuntimeContext(payload.messages), lastUser = [...messages].reverse().find(message => message.role === 'user');
    const exactMarker = message => message?.role === 'user' && textParts(message.content).length === 1 && textParts(message.content)[0].trim() === marker(phase);
    const matchingHistory = messages.some(message => message.role === 'tool' && message.tool_call_id === callId || message.role === 'assistant' && message.tool_calls?.some(call => call.id === callId));
    const latestExact = phases.find(candidate => textParts(lastUser?.content).some(text => text.trim() === marker(candidate)));
    if (latestExact && latestExact !== phase) throw Error('Old or unarmed phase marker');
    if (previous && matchingHistory) {
      assert.notEqual(phase, 'cancel', 'Canceled tool must not advance another model step');
      assert(!receipts.has(phase), 'No duplicate completion or business-call replay');
      assertComputerSchema(payload.tools);
      const assistantIndexes = messages.flatMap((message, index) => message.role === 'assistant' && message.tool_calls?.some(call => call.id === callId) ? [index] : []);
      assert.equal(assistantIndexes.length, 1, 'Original assistant call identity required');
      const assistantIndex = assistantIndexes[0], assistant = messages[assistantIndex];
      assert.equal(assistant.tool_calls.length, 1);
      assert.equal(assistant.tool_calls[0].function.name, 'computer_use');
      assert.deepEqual(JSON.parse(assistant.tool_calls[0].function.arguments), previous.args);
      const anchor = messages.slice(0, assistantIndex).findLast(message => message.role === 'user');
      assert(exactMarker(anchor), 'Current call must follow its exact current UI marker');
      const results = messages.filter(message => message.role === 'tool' && message.tool_call_id === callId);
      assert.equal(results.length, 1, 'Follow-up must include the actual matching tool_call_id');
      assert.equal(messages[assistantIndex + 1], results[0], 'Matching tool result must immediately follow original call');
      const value = toolValue(results[0].content), proof = proofOutput(value, nonce, phase);
      assert(value.images?.some(image => typeof image.attachmentId === 'string'), 'Actual screenshot attachment missing from tool wire');
      imageTail(messages.slice(assistantIndex + 2), value.images);
      receipts.set(phase, { ...proof, images: value.images });
      return [{ delta: { content: `WEB_CU_DONE:${nonce}:${phase}` }, finish_reason: 'stop' }];
    }
    if (!exactMarker(lastUser)) return [{ delta: { content: 'WEB_CU_AUXILIARY' }, finish_reason: 'stop' }];
    assertComputerSchema(payload.tools);
    assert(!previous, 'Missing actual matching tool_call_id; no retry or business-call replay');
    const args = { title: `Synthetic Web CU ${phase}`, code: code(phase), timeoutMs: phase === 'cancel' ? 120000 : 30000 };
    calls.set(phase, { callId, args });
    return [{ delta: { tool_calls: [{ index: 0, id: callId, type: 'function', function: { name: 'computer_use', arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }];
  };
  return { nonce, fixtureURL, marker, arm, respond, calls, receipts, get requestCount() { return requestCount; } };
}
