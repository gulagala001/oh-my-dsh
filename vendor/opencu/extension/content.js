(() => {
  if (globalThis.__opencuDocument) return;
  const documentId = crypto.randomUUID();
  let revision = 0, activitySequence = 0, userActivity;
  const expected = [];
  const automated = event => {
    const now = performance.now();
    for (let i = expected.length - 1; i >= 0; i--) if (expected[i].expires < now) expected.splice(i, 1);
    const index = expected.findIndex(item => item.type === event.type &&
      (item.key === undefined || item.key === event.key) && (item.x === undefined || Math.abs(item.x - event.clientX) <= 2 && Math.abs(item.y - event.clientY) <= 2) &&
      (item.deltaY === undefined || Math.abs(item.deltaX - event.deltaX) < 1 && Math.abs(item.deltaY - event.deltaY) < 1));
    if (index < 0) return false;
    expected.splice(index, 1); return true;
  };
  for (const type of ['pointerdown', 'keydown', 'input', 'wheel']) addEventListener(type, event => {
    if (!event.isTrusted || automated(event)) return;
    userActivity = { documentId, sequence: ++activitySequence, kind: type, at: new Date().toISOString() };
  }, true);
  const geometry = () => {
    const viewport = visualViewport;
    return { width: innerWidth, height: innerHeight, scrollX, scrollY, devicePixelRatio,
      visual: { x: viewport?.offsetLeft || 0, y: viewport?.offsetTop || 0, width: viewport?.width || innerWidth,
        height: viewport?.height || innerHeight, scale: viewport?.scale || 1 }, revision };
  };
  const cursorMutation = node => node.nodeType === 1 && (node.hasAttribute('data-opencu-cursor') || node.closest('[data-opencu-cursor]'));
  const mutation = new MutationObserver(records => {
    if (records.some(record => !cursorMutation(record.target) && (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(node => !cursorMutation(node))))) revision++;
  });
  mutation.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const event of ['scroll', 'resize']) addEventListener(event, () => revision++, true);
  visualViewport?.addEventListener('resize', () => revision++);
  globalThis.__opencuDocument = { run(method, input = {}) {
    if (input.documentId && input.documentId !== documentId) throw Object.assign(new Error('Document changed; select again.'), { code: 'STALE_DOCUMENT' });
    switch (method) {
      case 'identity': return { documentId, url: location.href, title: document.title, geometry: geometry(), userActivity };
      case 'expectInput': {
        const markerId = crypto.randomUUID();
        for (const event of input.events ?? []) expected.push({ ...event, markerId, expires: input.pending ? Infinity : performance.now() + 500 });
        return { expected: true, markerId, documentId };
      }
      case 'finishInput':
        for (let i = expected.length - 1; i >= 0; i--) if (expected[i].markerId === input.markerId) {
          if (input.dispatched) expected[i].expires = performance.now() + 500;
          else expected.splice(i, 1);
        }
        return { finished: true };
      case 'cursor':
        if (!globalThis.__opencuCursor) throw Object.assign(new Error('The original REA cursor runtime did not load.'), { code: 'CURSOR_UNAVAILABLE' });
        return globalThis.__opencuCursor.update({ ...input, waitForArrival: true });
      case 'release': expected.length = 0; void globalThis.__opencuCursor?.update({ visible: false }); return { released: true };
      default: throw Object.assign(new Error('Unknown content operation.'), { code: 'UNSUPPORTED_OPERATION' });
    }
  } };
})();
