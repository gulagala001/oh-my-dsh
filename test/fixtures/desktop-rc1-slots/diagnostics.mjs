// Persist the actual manager response before any receipt or hot-state assertion.
// Presence in this array is not validation; the original contract still decides.
export async function persistReceipt(report, value, save) {
  report.phase = value.operation + ':receipt-returned';
  report.targetStage = value.coldStage;
  value.validated = false;
  report.receipts.push(value);
  await save();
  return value;
}

export const diagnosticPrefix = 'OMD_RC1_DIAG ';
export const diagnosticLimits = { line: 2048, total: 16384 };
const choice = (value, allowed) => allowed.includes(value) ? value : 'other';
const number = value => Number.isSafeInteger(value) ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const fibers = value => (Array.isArray(value) ? value : []).slice(0, 8).map(row => ({
  uid: number(row.uid), state: Number.isInteger(row.state) && row.state >= 0 && row.state <= 5 ? row.state : null,
}));
const service = value => ({ strict: boolean(value?.activePresent), raw: boolean(value?.rawPresent),
  provider: fibers(value?.provider), readFailed: Boolean(value?.readError) });
const state = value => ({ owner: fibers(value?.uiConversation?.owner),
  conversation: service(value?.uiConversation?.conversation), rootConversation: service(value?.rootConversation),
  readFailed: Boolean(value?.readError), observerUnavailable: Boolean(value?.observerUnavailable) });

// Closed field/value projection. Never serialize source objects, errors, names,
// paths, receipt details, configuration, session state or environment values.
export function diagnosticLogLines(report, capture) {
  const ui = capture.renderer ?? {}, crashes = ui.crashes ?? [], timeline = ui.timeline ?? [];
  const base = crashes[0]?.at ?? timeline[0]?.at ?? capture.at;
  const relative = at => Number.isFinite(at) && Number.isFinite(base)
    ? Math.max(-720000, Math.min(720000, Math.round(at - base))) : null;
  const lines = []; let size = 0, omitted = 0;
  const add = row => {
    const line = diagnosticPrefix + JSON.stringify(row);
    const bytes = Buffer.byteLength(line + '\n');
    if (bytes > diagnosticLimits.line || size + bytes > diagnosticLimits.total - 128) { omitted++; return; }
    lines.push(line); size += bytes;
  };
  const operations = ['install', 'disable', 'reenable'];
  const phases = ['stock', 'checks-complete', ...operations.flatMap(op =>
    ['request', 'receipt-returned', 'hot-check', 'cold-check'].map(phase => op + ':' + phase))];
  add({ kind: 'capture', label: choice(capture.label, ['failure-immediate', 'failure-followup',
    ...operations.map(op => op + ':receipt-returned')]), phase: choice(capture.phase, phases),
    stage: choice(capture.targetStage, ['stock', 'installed', 'disabled', 'reenabled']),
    errors: Array.isArray(capture.errors) ? capture.errors.length : null,
    hostReadFailed: Boolean(capture.hostError), rendererReadFailed: Boolean(capture.rendererError),
    timelineDropped: number(ui.dropped), crashCount: crashes.length, timelineCount: timeline.length,
    receipts: (report.receipts ?? []).slice(0, 3).map(row => ({ operation: choice(row.operation, operations),
      application: choice(row.receipt?.application, ['applied', 'restart-required']),
      changed: boolean(row.receipt?.changed), validated: boolean(row.validated) })), state: state(ui) });
  const identities = new Set();
  for (const value of [ui, ...crashes.map(row => row.state)]) {
    const face = state(value);
    for (const fiber of [...face.owner, ...face.conversation.provider, ...face.rootConversation.provider]) {
      if (fiber.uid !== null && fiber.uid !== 0) identities.add(fiber.uid);
    }
  }
  for (const row of crashes.slice(0, 8)) add({ kind: 'crash', ms: relative(row.at),
    sequence: number(row.sequence), registrationId: number(row.registrationId),
    key: choice(row.key, ['conversation.composer.bar', 'conversation.input.model', 'conversation.input.model.label']),
    registrant: choice(row.registrant, ['trisoul_x', 'ui-conversation', 'omd-ui-conversation',
      '@deepseek-ai/dsh-client-ui-conversation']), abdicated: boolean(row.abdicated), state: state(row.state) });
  const relevant = timeline.filter(row => row.kind === 'internal/service'
    || identities.has(row.fiber?.[0]?.uid));
  for (const row of relevant.slice(-40)) add({ kind: choice(row.kind, ['internal/plugin', 'internal/status', 'internal/service']),
    ms: relative(row.at), sequence: number(row.sequence), oldState: number(row.oldState),
    fiber: fibers(row.fiber), service: choice(row.name, ['conversation', 'uiConversation']),
    conversation: service(row.conversation ?? row.state?.uiConversation?.conversation) });
  add({ kind: 'end', omittedRows: omitted + Math.max(0, crashes.length - 8) + Math.max(0, relevant.length - 40) });
  return lines;
}

export function printDiagnosticSummary(report, capture, write = line => console.log(line)) {
  for (const line of diagnosticLogLines(report, capture)) write(line);
}
