import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ScriptedModel, Gate } from './scene.mjs';
import { until } from './host.mjs';
import { textReply, toolReply, toolNames, userText } from './scenarios.mjs';
import { assertNoLeak, assertToolPairs } from './assertions.mjs';

const usage = { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 };
const invalid = message => { throw Object.assign(Error(message), { code: 'INVALID_SCENARIO' }); };
const resultsText = payload => {
  const message = payload.messages.filter(message => message.role === 'tool').at(-1);
  return typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content);
};

// This validates the supported input grammar and causal prerequisites only.
// Actual host state, tool execution and persistence are always read from DSH.
function validate(value) {
  if (!value || !Array.isArray(value.actions) || !value.actions.length || value.actions.length > 10000
    || !value.parameters || typeof value.parameters !== 'object') invalid('Missing finite actions/parameters');
  const p = value.parameters;
  if (typeof p.text !== 'string' || !p.text || typeof p.sourceSentinel !== 'string' || !p.sourceSentinel
    || !p.text.includes(p.sourceSentinel) || !Number.isSafeInteger(p.number)) invalid('Invalid text/sourceSentinel/number');
  if (value.actions[0]?.type !== 'prompt' || value.actions[0].text !== p.text) invalid('A matching initial prompt is required');
  let wrote = false, stream = false, cancelled = false, resumed = false;
  for (let index = 1; index < value.actions.length; index++) {
    const action = value.actions[index], previous = value.actions[index - 1];
    if (!action || typeof action !== 'object') invalid('Invalid action');
    if (resumed) invalid('No actions may follow resume in this finite grammar');
    switch (action.type) {
      case 'write':
        if (stream || action.path !== 'exploration.txt' || action.text !== p.text) invalid('Invalid write or write after stream');
        wrote = true; break;
      case 'read':
        if (stream || !wrote || action.path !== 'exploration.txt') invalid('Read requires a prior write');
        break;
      case 'restart':
        if (stream || !['write', 'read'].includes(previous.type)
          || action.checkpoint !== `after-${previous.type}` || action.checkpoint !== p.restartCheckpoint
          || value.actions[index + 1]?.type !== 'read') invalid('Restart requires the stated tool checkpoint and a following read');
        break;
      case 'stream':
        if (stream || wrote || !Number.isSafeInteger(action.split) || action.split < 0 || action.split > p.text.length
          || action.split !== p.streamSplit || !Number.isSafeInteger(action.lateChunks) || action.lateChunks < 0
          || action.lateChunks > 100 || action.lateChunks !== p.lateChunks) invalid('Invalid stream split/late-chunk configuration');
        stream = true; break;
      case 'delay':
        if (!stream || cancelled || previous.type !== 'stream' || !Number.isSafeInteger(action.ms)
          || action.ms < 0 || action.ms > 1000 || action.ms !== p.delayMs || action.phase !== p.cancelOrder) invalid('Invalid bounded stream delay');
        break;
      case 'cancel':
        if (!stream || cancelled || !['stream', 'delay'].includes(previous.type)
          || !['before-completion', 'after-completion'].includes(action.phase)
          || action.phase !== p.cancelOrder) invalid('Cancel requires its stream and declared completion order');
        cancelled = true; break;
      case 'resume':
        if (!cancelled || previous.type !== 'cancel') invalid('Resume requires a prior cancel');
        resumed = true; break;
      default: invalid('Unsupported action: ' + action.type);
    }
  }
  if (stream && !resumed) invalid('Stream cases must cancel and resume');
  if (wrote && !value.actions.some(action => action.type === 'read')) invalid('Write cases must verify through read');
}

export function createGeneratedDefinition(caseValue) {
  validate(caseValue);
  const input = structuredClone(caseValue);
  return { id: input.id ?? `generated-${input.seed ?? 0}`, generatedCase: structuredClone(input), title: '生成动作驱动真实宿主：' + input.actions.map(action => action.type).join(' → '),
    create({ trace = () => {} } = {}) {
      const { parameters: p, actions } = input;
      const gates = [], steps = [], actionSteps = new Map();
      const material = p.text + `\nNUMBER=${p.number}`;
      const done = `GENERATED_DONE_${p.sourceSentinel}`;
      const resumed = `GENERATED_RESUMED_${p.sourceSentinel}`;
      const oldLate = `GENERATED_OLD_EXECUTOR_${p.sourceSentinel}`;
      const late = `GENERATED_LATE_${p.sourceSentinel}`;
      const tail = `GENERATED_TAIL_${p.sourceSentinel}`;
      let pendingRead = false, readValidated = 0, streamBarrier, streamRequestId;
      const producer = { state: 'not-started', chunks: [], signalAborted: false };
      const addStep = (id, reply, expect) => {
        const gate = new Gate(); gates.push(gate);
        const mustCheckRead = pendingRead; pendingRead = false;
        const entry = { gate, id };
        steps.push({ id, expect: payload => {
          if (mustCheckRead) {
            const actual = resultsText(payload);
            assert.ok(actual.includes(p.text), 'real read result must retain complete Unicode source text');
            assert.ok(actual.includes(p.sourceSentinel), 'real read result must retain source sentinel');
            assert.ok(actual.includes(`NUMBER=${p.number}`), 'real read result must retain numeric parameter');
            readValidated++;
          }
          expect?.(payload);
        }, reply: (payload, context) => ({ chunks: (async function* () {
          await gate.wait(context.signal);
          const response = reply(payload, context);
          for await (const chunk of response.chunks) yield chunk;
        })() }) });
        return entry;
      };
      for (let index = 1; index < actions.length; index++) {
        const action = actions[index];
        if (action.type === 'write') actionSteps.set(index, addStep(`action-${index}-write`, () =>
          toolReply('write', { file_path: action.path, content: material }, `generated-write-${index}`, { split: p.streamSplit })));
        if (action.type === 'read') {
          actionSteps.set(index, addStep(`action-${index}-read`, () => toolReply('read', { file_path: action.path }, `generated-read-${index}`)));
          pendingRead = true;
        }
        if (action.type === 'restart') actionSteps.set(index, addStep(`action-${index}-restart-hold`, () => textReply(oldLate)));
        if (action.type === 'stream') {
          streamBarrier = new Gate(); gates.push(streamBarrier);
          actionSteps.set(index, addStep(`action-${index}-stream`, (_payload, { signal, requestId }) => ({ chunks: (async function* () {
            streamRequestId = requestId;
            yield { delta: { role: 'assistant', content: p.text.slice(0, action.split) }, finish_reason: null };
            producer.state = 'waiting';
            // Deliberately ignore transport abort: production is bounded by the
            // finite chunk count and the cleanup-owned Gate. Construct all late
            // results before yielding, even if iterator.return() is now queued.
            try {
              await streamBarrier.wait();
              producer.signalAborted = signal?.aborted === true;
              producer.chunks = [{ delta: { content: p.text.slice(action.split) + tail }, finish_reason: null },
                ...Array.from({ length: action.lateChunks }, (_, chunk) => ({ delta: { content: `${late}_${chunk}` }, finish_reason: null })),
                { delta: { content: done }, finish_reason: 'stop', usage }];
              for (const [chunkIndex, chunk] of producer.chunks.entries()) trace({ type: 'generated/producer-chunk', requestId,
                chunkIndex, afterAbort: producer.signalAborted, chunk });
              producer.state = 'generated';
            } catch (error) { producer.state = 'aborted'; throw error; }
            for (const chunk of producer.chunks) yield chunk;
          })() })));
        }
        if (action.type === 'resume') actionSteps.set(index, addStep(`action-${index}-resume`, () => textReply(resumed)));
      }
      const hasStream = actions.some(action => action.type === 'stream');
      const terminal = hasStream ? null : addStep('finish', () => textReply(actions.length === 1 ? material + '\n' + done : done));
      const firstExpect = steps[0].expect;
      steps[0].expect = payload => {
        assert.ok(userText(payload).includes(p.text), 'real initial model request must contain the generated prompt');
        firstExpect(payload);
      };
      const model = new ScriptedModel({ trace, lanes: [
        { id: 'main', match: payload => toolNames(payload).includes('todo_write'), steps },
        { id: 'title', match: payload => !payload.tools?.length && JSON.stringify(payload.messages[0]?.content)
          ?.includes('Create a concise title for an AI coding-assistant session'),
          steps: [{ id: 'optional-title', optional: true, repeat: 20, reply: () => textReply('生成场景离线验收') }] },
      ] });
      // Gate entries map one-to-one to real model requests. A tool step is not
      // considered complete until DSH requests its next reply with tool results.
      const ordered = [...actionSteps.values(), ...(terminal ? [terminal] : [])];
      const nextStep = entry => ordered[ordered.indexOf(entry) + 1];
      return { model, gates, async run({ host, checks, provider, trace: runTrace = trace }) {
        const id = await host.createSession();
        const entered = gate => until(() => gate.snapshot().arrivals > 0, { signal: host.signal,
          description: 'generated model request boundary', check: () => {
            host.check?.();
            const error = model.snapshot().errors[0];
            if (error) throw Object.assign(Error(error.message), { code: error.code });
          } });
        let streamCompleted = false, wrote = false;
        const streamRequest = () => {
          const request = provider?.requests.find(request => request.id === streamRequestId);
          assert.ok(request, 'stream producer must belong to the actual provider request ledger');
          return request;
        };
        const generated = () => until(() => producer.state === 'generated', { signal: host.signal,
          description: 'bounded stream producer actually generates its tail', check: () => {
            host.check?.(); assert.notEqual(producer.state, 'aborted', 'late producer was aborted instead of generating');
          } });
        const completeStream = async () => {
          if (streamCompleted) return;
          streamBarrier.release(); await host.idle(id); streamCompleted = true;
        };
        for (let index = 0; index < actions.length; index++) {
          const action = actions[index], entry = actionSteps.get(index);
          runTrace({ type: 'generated/action', index, action });
          switch (action.type) {
            case 'prompt':
              await host.prompt(id, action.text);
              await entered(ordered[0].gate);
              break;
            case 'write':
            case 'read':
              await entered(entry.gate); entry.gate.release();
              await entered(nextStep(entry).gate);
              if (action.type === 'write') wrote = true;
              break;
            case 'restart': {
              await entered(entry.gate);
              const checkpoint = await host.control('/snapshot?session=' + id);
              await host.restart({ crash: true }); entry.gate.release();
              await host.createSession({ id });
              await checks.check('生成场景：原生检查点恢复 ' + action.checkpoint, async () => {
                const restored = await host.control('/snapshot?session=' + id);
                assert.deepEqual(restored.events.slice(0, checkpoint.events.length), checkpoint.events);
                assert.equal(await readFile(join(host.workspace, 'exploration.txt'), 'utf8'), material);
              });
              await host.prompt(id, `从 ${action.checkpoint} 恢复 ${p.sourceSentinel}，继续指定动作。`);
              await entered(nextStep(entry).gate);
              break;
            }
            case 'stream':
              await entered(entry.gate); entry.gate.release(); await entered(streamBarrier);
              break;
            case 'delay':
              if (action.phase === 'after-completion') await completeStream();
              if (host.clockMode === 'virtual') await host.control('/clock', { advance: action.ms });
              else await sleep(action.ms, undefined, { signal: host.signal });
              break;
            case 'cancel':
              if (action.phase === 'after-completion') await completeStream();
              await host.rpc('session/cancel', { sessionId: id }); await host.idle(id);
              if (action.phase === 'before-completion') {
                await until(() => streamRequest().state === 'aborted', { signal: host.signal, description: 'old provider request cancellation' });
              }
              streamBarrier.release();
              await generated();
              await until(() => streamRequest().cleanup?.state !== 'pending'
                && !(streamRequest().callbacks ?? []).some(callback => callback.state === 'pending'),
              { signal: host.signal, description: 'late producer callback and iterator cleanup' });
              await checks.check('生成场景：取消与完成顺序 ' + action.phase, async () => {
                const request = streamRequest();
                assert.equal(producer.chunks.length, p.lateChunks + 2);
                const snapshot = await host.control('/snapshot?session=' + id);
                if (action.phase === 'before-completion') {
                  assert.equal(request.state, 'aborted'); assert.equal(producer.signalAborted, true);
                  assertNoLeak(request.chunks, tail); assertNoLeak(request.chunks, late); assertNoLeak(request.chunks, done);
                  assertNoLeak(snapshot.events, tail); assertNoLeak(snapshot.events, late); assertNoLeak(snapshot.events, done);
                } else {
                  assert.equal(request.state, 'completed'); assert.equal(producer.signalAborted, false);
                  const committed = request.chunks.map(chunk => chunk.delta?.content ?? '').join('');
                  assert.ok(committed.includes(p.text)); assert.ok(committed.includes(tail)); assert.ok(committed.includes(done));
                  assert.ok(JSON.stringify(snapshot.events).includes(tail)); assert.ok(JSON.stringify(snapshot.events).includes(done));
                  for (let chunk = 0; chunk < p.lateChunks; chunk++) {
                    assert.ok(committed.includes(`${late}_${chunk}`)); assert.ok(JSON.stringify(snapshot.events).includes(`${late}_${chunk}`));
                  }
                }
                runTrace({ type: 'generated/producer-proof', requestId: streamRequestId, state: request.state,
                  producedChunks: producer.chunks.length, lateChunks: p.lateChunks, afterAbort: producer.signalAborted });
              });
              break;
            case 'resume':
              await host.prompt(id, `继续 ${p.sourceSentinel}，NUMBER=${p.number}`);
              await entered(entry.gate); entry.gate.release(); await host.idle(id);
              break;
          }
        }
        if (terminal) { terminal.gate.release(); await host.idle(id); }
        await checks.check('生成场景：原生事件及实际工具结果', async () => {
          const native = await host.durable(id);
          assertToolPairs(native.events);
          const serialized = JSON.stringify(native.events);
          assert.ok(serialized.includes(hasStream ? resumed : done));
          assertNoLeak(native.events, oldLate);
          if (hasStream && p.cancelOrder === 'before-completion') { assertNoLeak(native.events, tail); assertNoLeak(native.events, late); }
          if (wrote) {
            assert.equal(await readFile(join(host.workspace, 'exploration.txt'), 'utf8'), material);
            assert.equal(readValidated, actions.filter(action => action.type === 'read').length);
          }
        });
        return { sessionId: id, generatedCase: input, readValidated, actionCount: actions.length };
      } };
    },
  };
}
