import test from 'node:test';
import assert from 'node:assert/strict';
import { installRequestProjection } from '../src/llm-request-projection.mjs';

function fixture() {
  const requests = [];
  const runtime = {
    stream(options) { assert.equal(this, runtime); requests.push(options); return options; },
    async prepareCall() { assert.equal(this, runtime); return Object.freeze({ generation: 'native-adapter', stream: options => { requests.push(options); return options; } }); },
  };
  const owner = project => {
    let dispose;
    installRequestProjection({ llm: runtime, effect(fn) { dispose = fn(); } }, project);
    return dispose;
  };
  const append = name => options => Object.freeze({ ...options, sequence: options.sequence + name });
  return { runtime, requests, owner, append };
}

test('additional projections retain one stable entry point and prepared calls retain their creation-time registrations', async () => {
  const f = fixture(), native = { stream: f.runtime.stream, prepare: f.runtime.prepareCall };
  const dropOne = f.owner(f.append('1')), shared = f.runtime.stream;
  const prepared = await f.runtime.prepareCall();
  const dropTwo = f.owner(f.append('2'));
  assert.equal(f.runtime.stream, shared, 'another OMD adapter does not replace a method captured by other plugins');
  const input = Object.freeze({ sequence: '' });
  assert.equal(f.runtime.stream(input).sequence, '21');
  assert.equal(prepared.generation, 'native-adapter');
  assert.equal(prepared.stream(input).sequence, '1', 'a newly registered adapter cannot enter an already prepared request');
  dropOne();
  assert.equal(prepared.stream(input), input, 'removed adapters do not remain active in captured prepared calls');
  assert.equal(f.runtime.stream(input).sequence, '2');
  dropTwo();
  assert.equal(f.runtime.stream, native.stream); assert.equal(f.runtime.prepareCall, native.prepare);
  assert.equal(input.sequence, '');
});

test('foreign wrappers between projection owners retain their order and survive reverse and nonreverse disposal', async () => {
  for (const reverse of [false, true]) {
    const f = fixture(), dropOne = f.owner(f.append('1'));
    const captured = f.runtime.stream;
    const foreign = function(options) { return captured.call(this, f.append('F')(options)); };
    f.runtime.stream = foreign;
    const dropTwo = f.owner(f.append('2'));
    const input = Object.freeze({ sequence: '' });
    assert.equal(f.runtime.stream(input).sequence, '2F1');
    if (reverse) { dropTwo(); assert.equal(f.runtime.stream, foreign); dropOne(); }
    else { dropOne(); assert.equal(f.runtime.stream(input).sequence, '2F'); dropTwo(); }
    assert.equal(f.runtime.stream, foreign);
    assert.equal(f.runtime.stream(input).sequence, 'F', 'foreign-captured wrappers become transparent when their OMD owners leave');
  }
});
