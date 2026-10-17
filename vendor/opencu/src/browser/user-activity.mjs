const worldName = 'opencu-user-activity';

function installMonitor() {
  if (globalThis.opencuActivity) return;
  const documentId = [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join(''), expected = [], listeners = [];
  let sequence = 0, activity;
  const matches = (item, event) => item.type === event.type &&
    (item.key === undefined || item.key === event.key || item.key === event.code) &&
    (item.x === undefined || Math.abs(item.x - event.clientX) <= 2 && Math.abs(item.y - event.clientY) <= 2);
  for (const type of ['pointerdown', 'keydown', 'input', 'wheel']) {
    const listener = event => {
      if (!event.isTrusted) return;
      const now = performance.now();
      while (expected[0]?.expires < now) expected.shift();
      const index = expected.findIndex(item => matches(item, event));
      if (index >= 0) { expected.splice(index, 1); return; }
      activity = {documentId, sequence: ++sequence, kind: type, at: new Date().toISOString()};
    };
    addEventListener(type, listener, true); listeners.push([type, listener]);
  }
  globalThis.opencuActivity = {
    read: () => activity ?? null,
    expect(events) { for (const event of events) expected.push({...event, expires: performance.now() + 500}); },
    dispose() {
      for (const [type, listener] of listeners) removeEventListener(type, listener, true);
      delete globalThis.opencuActivity;
    },
  };
}

/** A separate Chromium world observes real input without exposing hooks to the site. */
export async function createUserActivityMonitor(session) {
  const source = `(${installMonitor.toString()})()`;
  const {identifier} = await session.send('Page.addScriptToEvaluateOnNewDocument', {source, worldName});
  async function evaluate(expression) {
    const {frameTree} = await session.send('Page.getFrameTree');
    const {executionContextId} = await session.send('Page.createIsolatedWorld', {frameId: frameTree.frame.id, worldName});
    const result = await session.send('Runtime.evaluate', {contextId: executionContextId,
      expression: `${source};${expression}`, returnByValue: true});
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  }
  await evaluate('null');
  return {
    read: () => evaluate('globalThis.opencuActivity.read()'),
    expect: events => evaluate(`globalThis.opencuActivity.expect(${JSON.stringify(events)})`),
    async dispose() {
      await session.send('Page.removeScriptToEvaluateOnNewDocument', {identifier});
      await evaluate('globalThis.opencuActivity.dispose()');
    },
  };
}
