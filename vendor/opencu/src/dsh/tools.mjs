import { computerDescription, resetDescription } from './computer-docs.mjs';
import { modelResult } from './model-output.mjs';
import { createObservationProjector } from './observation-output.mjs';
import { controlFailure } from '../protocol.mjs';
import { toolReplError } from './repl-output.mjs';

export const TOOLS = [
  { name: 'opencu_connectBrowser', description: 'Request a local Chrome / Edge connection. On first use the installed extension automatically asks the user to Allow once; pairing persists across normal restarts and updates. Use browser from discovered candidates (extension:<id>), Chrome, Edge, or external. Does not select a tab or replay input.', inputSchema: { type: 'object', properties: { browser: { type: 'string' } } } },
  { name: 'opencu_state', description: 'Read OpenCU control state and backend availability; stored observations and annotations are summarized unless includeHistory is true.', inputSchema: { type: 'object', properties: { includeHistory: { type: 'boolean' } } } },
  { name: 'opencu_targets', description: 'List real browser and native targets managed by this plugin.', inputSchema: { type: 'object', properties: {} } },
  { name: 'opencu_select', description: 'Select one unambiguous live target by reference without activating its window or tab. Read target.control for background routes and limits.', inputSchema: { type: 'object', properties: { reference: { oneOf: [{ type: 'string' }, { type: 'object' }] } }, required: ['reference'] } },
  { name: 'opencu_observe', description: 'Low-level observation; prefer computer_use. Read compact AX (format defaults to ax), screenshot, or both. details:true returns raw nodes/geometry; disableDiffing:true forces a full baseline.', inputSchema: { type: 'object', properties: { targetId: { type: 'string' }, format: { type: 'string', enum: ['ax', 'screenshot', 'both'] }, details: {type:'boolean'}, disableDiffing: {type:'boolean'} } } },
  { name: 'opencu_act', description: 'Perform a browser/native action on a verified target. Use elementId and observationId from the latest observation, or x/y in its declared coordinateSpace. Navigation uses url; type uses text; fill uses value; press/keyDown/keyUp use key; scroll uses deltaX/deltaY; drag uses path points. Input defaults to background without global mouse/keyboard fallback. FOREGROUND_REQUIRED means ask the user before explicit focus and inputMode=foreground; it is not permission to switch automatically. A dispatch acknowledgement does not verify the effect.', inputSchema: { type: 'object', properties: {
    targetId: { type: 'string' }, action: { type: 'string' }, inputMode: { type: 'string', enum: ['background', 'foreground'] }, elementId: { oneOf: [{ type: 'integer' }, { type: 'string' }] }, observationId: { type: 'string' },
    screenshotId: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' }, url: { type: 'string' }, text: { type: 'string' },
    value: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] }, key: { type: 'string' },
    button: { type: 'string', enum: ['left', 'middle', 'right'] }, deltaX: { type: 'number' }, deltaY: { type: 'number' },
    path: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
    files: { type: 'array', items: { type: 'string' } },
    locator: {type:'array', items:{type:'object'}}, method: {type:'string'}, args: {type:'object'},
  }, required: ['action'], additionalProperties: true } },
  { name: 'opencu_stop', description: 'Stop control and release held input. Do not assume success when release fails.', inputSchema: { type: 'object', properties: {} } },
  { name: 'opencu_resume', description: 'Resume one verified target, or one connected browser by browserId even when it has no tabs. Native input must release and old browser targets stay quarantined. After explicit stop, resume only when the user requests continuation.', inputSchema: { type: 'object', properties: { targetId: { type: 'string' }, browserId: { type: 'string' } } } },
  { name: 'opencu_deliveries', description: 'List persistent downloaded files.', inputSchema: { type: 'object', properties: {} } },
  { name: 'opencu_focus', description: 'Explicitly bring a verified target window or tab to the foreground, without starting control. Do not use as an automatic fallback from unavailable background input.', inputSchema: { type: 'object', properties: { targetId: { type: 'string' }, reference: { type: 'object' } } } },
  { name: 'opencu_openTarget', description: 'Open a browser tab through a real selected browser target. Native app launching is not synthesized.', inputSchema: { type: 'object', properties: { browserId: { type: 'string' }, targetId: { type: 'string' }, url: { type: 'string' } } } },
  { name: 'opencu_permissions', description: 'Read actual native helper permission status without changing permissions.', inputSchema: { type: 'object', properties: {} } },
  { name: 'computer_use', description: computerDescription, inputSchema: { type: 'object', properties: { code: { type: 'string' }, title: { type: 'string' }, timeoutMs: { type: 'integer' }, restoreDocumentation: {type:'boolean'} }, required: ['code', 'title'] } },
  { name: 'computer_use_reset', description: resetDescription, inputSchema: { type: 'object', properties: {} } },
  { name: 'opencu_annotate', description: 'Persist user annotations for a selected target without changing the target.', inputSchema: { type: 'object', properties: { targetId: { type: 'string' }, annotations: { type: 'array', items: { type: 'object' } }, note: { type: 'string' } }, required: ['targetId', 'annotations'] } },
];

for (const tool of TOOLS) if (tool.name.startsWith('opencu_') && tool.name !== 'opencu_observe') tool.description = 'Low-level compatibility/diagnostic API; prefer computer_use for normal UI work. ' + tool.description;
TOOLS.sort((a, b) => Number(b.name.startsWith('computer_use')) - Number(a.name.startsWith('computer_use')));

export function renderResult(args, value) {
  const content = [{ type: 'text', text: JSON.stringify(modelResult(value, args)) }];
  const images = [value.image, ...(value.images ?? [])].filter(image => image?.attachmentId);
  for (const image of new Map(images.map(image => [image.attachmentId, image])).values()) content.push({ type: 'image', attachment: image });
  for (const item of value.deliveries ?? []) if (item.file?.attachmentId) content.push({ type: 'file', attachment: item.file });
  return content;
}

export function installToolDefinitions(ctx, lease, sessionKey) {
  const observations = new Map();
  for (const tool of TOOLS) {
    const endpoint = tool.name.startsWith('opencu_') ? tool.name.slice('opencu_'.length) : tool.name;
    ctx.effect(() => ctx.tools.register({
      name: tool.name, description: tool.description, parameters: tool.inputSchema,
      output: { schema: { type: 'object', additionalProperties: true }, render: renderResult },
      async execute(args = {}, exec) {
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('OpenCU arguments must be an object');
        for (const key of tool.inputSchema.required || []) if (args[key] === undefined) throw new Error(`${key} is required`);
        const id = exec.agent?.session?.id ?? sessionKey;
        const optimization = ctx.get?.('omd')?.optimization;
        const fullBaseline = optimization && exec.agent && !optimization.computerBaseline(exec.agent.session);
        let projector = observations.get(id);
        if (!projector) { projector = createObservationProjector(); observations.set(id, projector); if (observations.size > 64) observations.delete(observations.keys().next().value); }
        if (fullBaseline) { projector.reset(); if (endpoint === 'computer_use' || endpoint === 'observe') optimization.resetComputerBaseline(exec.agent.session); }
        if (endpoint === 'computer_use' && fullBaseline) args = { ...args, restoreObservationBaseline: true };
        if (endpoint === 'observe') args = {format:'ax', ...args};
        else if (['select','resume','stop','computer_use','computer_use_reset','openTarget'].includes(endpoint) || endpoint === 'act' && ['navigate','back','forward','reload','closeTab','domSnapshot'].includes(args.action)) projector.reset();
        try {
          const result = await lease.request(endpoint, args, { signal: exec.signal, attachments: ctx.attachments, sessionKey: id, requestSource:'tool', modelProjection: endpoint === 'state' || endpoint === 'targets' });
          if (result.ok === false) throw controlFailure(result);
          return modelResult(projector.project(result, args), args);
        } catch (error) {
          projector.reset();
          // The host uses the exact caller reason to recognize cancellation.
          // A release failure or partial output is a different error and still
          // carries the diagnostics needed before any later input.
          if (exec.signal?.aborted && error === exec.signal.reason) throw error;
          throw toolReplError(error);
        }
      },
    }), `opencu: ${tool.name}`);
  }
}
