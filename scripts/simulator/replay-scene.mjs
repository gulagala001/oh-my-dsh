/** Keep scene rendezvous active while sending only the strictly recorded frames. */
export function replayWithScene(recorded, scene) {
  const chunks = scene?.chunks ?? scene;
  const iterator = chunks?.[Symbol.asyncIterator]?.() ?? chunks?.[Symbol.iterator]?.();
  if (!iterator || !Array.isArray(recorded?.chunks)) throw Error('Strict causal replay requires recorded frames and a scene iterator');
  return { ...recorded, chunks: (async function* () {
    let exhausted = false;
    try {
      for (const frame of recorded.chunks) {
        const next = await iterator.next();
        if (next.done) { exhausted = true; throw Error('Recorded stream has more frames than the current causal scene'); }
        yield frame;
      }
      const next = await iterator.next();
      if (!next.done) throw Error('Recorded stream has fewer frames than the current causal scene');
      exhausted = true;
    } finally {
      if (!exhausted) await iterator.return?.();
    }
  })() };
}
