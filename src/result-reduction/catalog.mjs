import { estimateText, estimateToolsTokens } from '../metering/estimate.mjs';
import { checkedTool } from '../tool-contract.mjs';
import { hash } from './evidence.mjs';

const loaded = new WeakMap();
const optional = name => /^mcp__/.test(name) && !/codegraph_explore$/.test(name) || /^opencu_/.test(name);
const chosen = agent => { if (!loaded.has(agent)) loaded.set(agent, new Map()); return loaded.get(agent); };
export const CONTEXT_TOOL_GUIDE = 'Use context_view for a bounded file/page outline, literal query, article or compact JSON view; use code_search for AST patterns in explicit files after locating them with glob or CodeGraph. Read exact source before editing. Partial views identify their scope and provide recall(rawRef, mode, cursor) for the original. In PTC call these tools through the SDK and emit only the result needed for the task; program values remain complete.';

// Presentation is shared across modes. The host retains registry, permission,
// dispatch and cancellation ownership; discovery never grants execution access.
export function selectCatalog(ctx, hub, agent, schemas) {
  if (!agent || !hub.optimization?.enabled(agent.session)) return { tools: schemas, hidden: [], notice: '' };
  const names = chosen(agent);
  for (const [name, definition] of names) if (ctx.tools.get(name, agent) !== definition) names.delete(name);
  const tools = schemas.filter(t => !optional(t.name) || names.has(t.name));
  const hidden = schemas.filter(t => !tools.includes(t));
  const notice = hidden.length ? `${hidden.length} optional tools are discoverable with tool_find(query). Available names: ${hidden.map(t => t.name).join(', ')}. Search by name or purpose; discovery returns exact current input/output contracts and includes them in the next request's Native catalog or PTC SDK. Permissions are unchanged.` : '';
  return { tools, hidden, notice };
}
export function rememberCatalog(hub, plan) {
  const service = hub.optimization;
  if (!service || !plan.notice) return;
  service.catalogPlans ??= new Map();
  const key = hash([plan.tools, plan.sdk, plan.notice]);
  service.catalogPlans.set(key, plan);
  while (service.catalogPlans.size > 128) service.catalogPlans.delete(service.catalogPlans.keys().next().value);
}
export function projectCatalogAssembly(assembly, { enabled, schemas, renderSdk, select, remember }) {
  if (!enabled) return assembly;
  const sdkSection = assembly.sections.find(s => s.name === 'tools:sdk' && s.text);
  const full = sdkSection ? schemas.filter(t => t.name !== 'run_code') : assembly.tools;
  let selection = select(full), sdk;
  if (selection.notice) {
    if (sdkSection) {
      if (typeof renderSdk !== 'function') throw Error('The active PTC SDK renderer is required for tool discovery');
      sdk = renderSdk(selection.tools);
    }
    const before = sdkSection ? estimateText(sdkSection.text) : estimateToolsTokens({ tools: full });
    const after = (sdkSection ? estimateText(sdk) : estimateToolsTokens({ tools: selection.tools })) + estimateText(selection.notice);
    if (after >= before) selection = { tools: full, hidden: [], notice: '' };
  }
  const hidden = new Set(selection.hidden.map(t => t.name));
  const sections = assembly.sections.filter(s => !['omd:context-tools', 'omd:tool-discovery'].includes(s.name)
    && (!s.name.startsWith('tool:') || !hidden.has(s.name.slice(5))));
  sections.push({ name: 'omd:context-tools', order: 81, text: CONTEXT_TOOL_GUIDE, interpolate: false });
  let tools = assembly.tools;
  if (selection.notice) {
    sections.push({ name: 'omd:tool-discovery', order: 81, text: selection.notice, interpolate: false });
    if (sdkSection) {

      sections[sections.indexOf(sdkSection)] = { ...sdkSection, text: sdk, interpolate: false };
      remember?.({ sdk, fullSdk: sdkSection.text, notice: selection.notice });
    } else {
      tools = selection.tools;
      remember?.({ tools, fullTools: full, notice: selection.notice, sdk: null });
    }
  }
  return { ...assembly, tools, sections };
}
export function installCatalog(ctx, hub) {
  ctx.tools.register(checkedTool({ name: 'tool_find', description: 'Find optional tools by name or purpose. Returns their exact input and output contracts and includes them in the next Native request or PTC SDK. Use an empty query to browse; permissions are unchanged.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      query: { type: 'string', description: 'Name or purpose, at most 256 characters; empty lists all optional tools.' },
      offset: { type: 'integer', description: 'Non-negative result offset, default 0.' },
      limit: { type: 'integer', description: '1–8 tools, default 4.' },
    }, required: ['query'] },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute({ query, offset = 0, limit = 4 }, { agent }) {
      if (query.length > 256 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 8) throw Error('需要有效 query、offset 和 limit');
      const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean), schemas = ctx.tools.schemas(agent).filter(t => optional(t.name));
      const matched = schemas.filter(t => terms.every(term => (t.name + ' ' + t.description).toLowerCase().includes(term)));
      const tools = matched.slice(offset, offset + limit).map(tool => ({ ...tool, output: ctx.tools.get(tool.name, agent)?.output?.schema }));
      for (const tool of tools) chosen(agent).set(tool.name, ctx.tools.get(tool.name, agent));
      return JSON.stringify({ available: schemas.length, matched: matched.length, tools, ...(offset + limit < matched.length ? { nextOffset: offset + limit } : {}) });
    },
  }));
}
