import { createHash } from 'node:crypto';
import { isPromise } from 'node:util/types';

// Test-only, authenticated connection/request waterfall. No data listener,
// reads, flow-mode changes, routes, body replay, headers or compensation writes.
export function createApprovalHttpObserver({ expected, requestLimit = 4096, responseLimit = 4096, maxActive = 16 }) {
  if (!Number.isSafeInteger(requestLimit) || requestLimit < 1 || requestLimit > 65536
    || !Number.isSafeInteger(responseLimit) || responseLimit < 1 || responseLimit > 4 * 1024 * 1024
    || !Number.isSafeInteger(maxActive) || maxActive < 1 || maxActive > 16) throw Error('Invalid private observation bound');
  const active = new Set(), records = [], failures = [];
  let disposed = false, matches = 0;
  const fail = code => { if (failures.length < 16) failures.push(code); };
  const scope = () => {
    const value = expected();
    return value && typeof value.sessionId === 'string' && value.sessionId && typeof value.requestId === 'string' && value.requestId
      ? { sessionId: value.sessionId, requestId: value.requestId } : undefined;
  };
  return {
    snapshot() { return { source: 'host-http', records: structuredClone(records), failures: [...failures], matches, active: active.size }; },
    dispose() { disposed = true; for (const close of [...active]) close(); },
    intercept(req, res, next) {
      let armed;
      try { armed = scope(); } catch { fail('scope-unavailable'); }
      if (disposed || !armed || req.method !== 'POST' || req.url !== '/api/opencu') return next();
      if (active.size >= maxActive) { fail('active-limit'); return next(); }
      const restores = [];
      let closed = false, requestEnded = false, matched = false, requestBytes = 0, responseBytes = 0, ending = 0;
      let requestChunks = [], responseChunks = [], finishedReceipt;
      let nextSucceeded = false, responseFinished = false;
      const restoreMethod = (object, key, wrapper, descriptor) => {
        if (object[key] !== wrapper) return;
        if (descriptor) Object.defineProperty(object, key, descriptor);
        else delete object[key];
      };
      const wrap = (object, key, factory) => {
        const descriptor = Object.getOwnPropertyDescriptor(object, key), original = object[key];
        const wrapper = factory(original);
        Object.defineProperty(object, key, { value: wrapper, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false });
        const restore = () => restoreMethod(object, key, wrapper, descriptor);
        restores.push(restore); return restore;
      };
      const cleanup = () => {
        if (closed) return;
        closed = true; requestChunks = []; responseChunks = []; finishedReceipt = undefined;
        res.off('finish', onFinish); res.off('close', onClose);
        for (const restore of restores.reverse()) { try { restore(); } catch { fail('restore-failed'); } }
        active.delete(cleanup);
      };
      const reject = code => { fail(code); cleanup(); };
      const copy = (chunk, encoding, response) => {
        if (closed || chunk === undefined || typeof chunk === 'function') return;
        try {
          const enc = typeof encoding === 'string' ? encoding : 'utf8';
          const size = typeof chunk === 'string' ? Buffer.byteLength(chunk, enc)
            : chunk instanceof Uint8Array ? chunk.byteLength : NaN;
          if (!Number.isSafeInteger(size)) return reject(response ? 'response-chunk' : 'request-chunk');
          if ((response ? responseBytes : requestBytes) + size > (response ? responseLimit : requestLimit))
            return reject(response ? 'response-limit' : 'request-limit');
          const bytes = typeof chunk === 'string' ? Buffer.from(chunk, enc) : Buffer.from(chunk);
          if (response) {
            responseBytes += bytes.length;
            responseChunks.push(bytes);
          } else {
            requestBytes += bytes.length;
            requestChunks.push(bytes);
          }
        } catch { reject(response ? 'response-chunk' : 'request-chunk'); }
      };
      const publish = () => {
        if (closed || !nextSucceeded || !responseFinished) return;
        if (records.length < 2) records.push(finishedReceipt);
        cleanup();
      };
      function onClose() { if (!closed && !responseFinished) reject('close-before-finish'); }
      function onFinish() {
        if (closed) return;
        if (!matched || !requestEnded || req.complete !== true || req.readableEnded !== true || res.writableFinished !== true) return reject('incomplete-finish');
        try {
          const current = scope();
          if (!current || current.sessionId !== armed.sessionId || current.requestId !== armed.requestId) return reject('scope-changed');
          const bytes = Buffer.concat(responseChunks), value = JSON.parse(bytes.toString('utf8'));
          if (!value || Object.keys(value).sort().join(',') !== 'ok,settled' || typeof value.ok !== 'boolean' || typeof value.settled !== 'boolean') return reject('response-json-shape');
          finishedReceipt = Object.freeze({ source: 'host-http', args: Object.freeze({
            conversationId: armed.sessionId, requestId: armed.requestId, action: 'decline', persist: null,
          }), status: res.statusCode, value: Object.freeze({ ok: value.ok, settled: value.settled }), responseBytes: bytes.length,
          responseSha256: createHash('sha256').update(bytes).digest('hex'), requestComplete: true, readableEnded: true, responseFinished: true });
          responseFinished = true; responseChunks = [];
        } catch { return reject('response-json'); }
        publish();
      }
      const beginResponse = () => {
        if (closed) return;
        let body;
        try { body = JSON.parse(Buffer.concat(requestChunks).toString('utf8')); }
        catch { return reject('request-json'); }
        finally { requestChunks = []; }
        const args = body?.args;
        if (!body || Object.keys(body).sort().join(',') !== 'args,method' || body.method !== 'appApprovals/respond'
          || !args || Object.keys(args).sort().join(',') !== 'action,conversationId,persist,requestId'
          || args.conversationId !== armed.sessionId || args.requestId !== armed.requestId || args.action !== 'decline' || args.persist !== null) return cleanup();
        matched = true; matches++;
        if (matches > 1) fail('duplicate-response');
        try {
          wrap(res, 'write', original => function (...args) {
            if (this === res && ending === 0) copy(args[0], args[1], true);
            try { return Reflect.apply(original, this, args); } catch (error) { reject('write-threw'); throw error; }
          });
          wrap(res, 'end', original => function (...args) {
            if (this === res && ending === 0) copy(args[0], args[1], true);
            ending++;
            try { return Reflect.apply(original, this, args); } catch (error) { reject('end-threw'); throw error; }
            finally { ending--; }
          });
        } catch { reject('response-wrap'); }
      };
      active.add(cleanup);
      try {
        res.once('finish', onFinish); res.once('close', onClose);
        const restoreEmit = wrap(req, 'emit', original => function (...args) {
          if (this === req && !closed) {
            if (args[0] === 'data') copy(args[1], undefined, false);
            else if (args[0] === 'end') { requestEnded = true; restoreEmit(); beginResponse(); }
            else if (['aborted', 'error', 'close'].includes(args[0]) && !requestEnded) reject('request-interrupted');
          }
          try { return Reflect.apply(original, this, args); } catch (error) { reject('emit-threw'); throw error; }
        });
      } catch { reject('request-wrap'); }
      // Observe settlement without replacing the original return/Promise.
      let result;
      try { result = next(); } catch (error) { reject('next-threw'); throw error; }
      const fulfilled = () => { nextSucceeded = true; publish(); };
      try {
        if (isPromise(result)) Promise.prototype.then.call(result, fulfilled, () => reject('next-rejected'));
        else fulfilled();
      } catch { reject('next-observation'); }
      return result;
    },
  };
}
