// A request's plugins run before the native host appends its accepted input.
// Rewinding the first human input must include that admission's prologue, not
// leave its runtime/context messages in either the surface or the chat groups.
export function inputBoundaries(events) {
  const boundaries = new Map();
  let turnStart, boundary, seenHuman = false;
  for (const event of events) {
    if (event.type === 'turn/start') { turnStart = boundary = event.seq; seenHuman = false; }
    else if (event.type === 'step/start') boundary = event.data.step === 1 ? seenHuman ? undefined : turnStart ?? event.seq : event.seq;
    else if (event.type === 'user/message' && event.data.source?.kind === 'user') {
      boundaries.set(event.seq, boundary ?? event.seq);
      seenHuman = true;
      // A later input in the same admission must keep the earlier input and
      // its context. Likewise, never cross already emitted response/tool work.
      boundary = undefined;
    } else if (['assistant/message', 'assistant/live-chunk', 'tool/call', 'tool/result', 'step/end', 'turn/end'].includes(event.type)) {
      boundary = undefined;
      if (event.type === 'turn/end') turnStart = undefined;
    }
  }
  return boundaries;
}

// Old sidecars started at the human message. Project their proven admission
// boundary without editing the sidecar, native log, or stored undo snapshot.
export function expandedRanges(events, ranges) {
  const boundaries = inputBoundaries(events);
  return ranges.map(range => {
    const start = boundaries.get(range.start) ?? range.start;
    return start === range.start ? range : { ...range, start };
  });
}
