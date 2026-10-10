// Test instrumentation only. All state transitions remain owned by DSH/OMD.
import { appendFileSync, writeSync } from 'node:fs';
import { readJsonBody, sendJson, rejectUntrusted } from '../../src/http.mjs';

export const inject = ['llm', 'agents', 'sessions', 'sessionProjections', 'trisoulX'];
export function apply(ctx, config) {
  if (process.env.OMD_SIMULATION !== '1') throw Error('Simulation instrumentation requires its isolated launcher');
  const record = entry => {
    const item = { virtualAt: Date.now(), pid: process.pid, ...entry };
    if (entry.type === 'model/denied' && process.env.OMD_SIM_MONITOR_FD) writeSync(Number(process.env.OMD_SIM_MONITOR_FD), JSON.stringify(item) + '\n');
    appendFileSync(config.traceFile, JSON.stringify(item) + '\n');
  };
  // Use the public stream pipeline so scoped native agents are covered too;
  // replacing one service object's method misses the host's derived contexts.
  ctx.on('llm/stream', (request, next) => {
    const route = { provider: request.provider, model: request.model, sessionId: request.sessionId };
    if (request.provider !== 'simulation' || !config.models.includes(request.model)) {
      record({ type: 'model/denied', ...route });
      throw Error('Simulation refused an unconfigured model route: ' + JSON.stringify(route));
    }
    record({ type: 'model/route', ...route });
    return next();
  }, { global: true });
  ctx.on('session/event', (session, event) => record({ type: 'session/event', sessionId: session.id, event }), { global: true });
  ctx.on('agent/status', ({ agent, status }) => record({ type: 'agent/status', sessionId: agent.session.id, status }), { global: true });
  ctx.inject(['subprocess'], scope => {
    const service = scope.subprocess, terminal = service.spawnTerminal;
    if (typeof terminal !== 'function') return;
    // Native PTY launches bypass Node's process gate. Until that independent
    // ownership boundary is verified, fail before creating an untracked job.
    const wrapped = async function () { throw Object.assign(Error('Native PTY is outside the simulator process-control boundary'), { code: 'SIM_CAPABILITY_UNVERIFIED' }); };
    service.spawnTerminal = wrapped;
    scope.effect(() => () => { if (service.spawnTerminal === wrapped) service.spawnTerminal = terminal; });
  });
  ctx.inject(['webServer'], web => web.effect(() => web.webServer.register({ kind: 'prefix', path: '/__simulation', async handler(req, res) {
    if (rejectUntrusted(ctx, req, res)) return;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/__simulation/clock') {
        const clock = globalThis[Symbol.for('omd.simulation.clock')];
        if (!clock) throw Error('Simulation clock preload is missing');
        if (req.method === 'POST') {
          const input = await readJsonBody(req);
          if (input.enable) await clock.enable(input.now);
          if (input.advance != null) await clock.advance(input.advance);
        } else if (req.method !== 'GET') { sendJson(res, 405, { error: 'Use GET or POST' }); return; }
        sendJson(res, 200, clock.snapshot()); return;
      }
      if (url.pathname === '/__simulation/snapshot' && req.method === 'GET') {
        const id = url.searchParams.get('session'), agent = ctx.agents.get(id);
        if (!agent) throw Error('No loaded simulation session: ' + id);
        await ctx.sessions.flush(agent.session);
        sendJson(res, 200, { header: agent.session.header, events: agent.session.snapshotEvents(), messages: agent.session.deriveMessages(), status: agent.status }); return;
      }
      if (url.pathname === '/__simulation/probe-model' && req.method === 'POST') {
        const input = await readJsonBody(req);
        try {
          const result = ctx.llm.stream({ provider: input.provider, model: input.model, messages: [], system: '', signal: new AbortController().signal });
          for await (const _part of result) {}
          sendJson(res, 200, { refused: false });
        } catch (error) { sendJson(res, 200, { refused: true, message: error.message }); }
        return;
      }
      if (url.pathname === '/__simulation/fault') {
        const faults = globalThis[Symbol.for('omd.simulation.faults')];
        if (!faults) throw Error('File fault preload is missing');
        if (req.method === 'POST') { const input = await readJsonBody(req); if (input.clear) faults.clear(); else faults.arm(input); }
        else if (req.method !== 'GET') { sendJson(res, 405, { error: 'Use GET or POST' }); return; }
        sendJson(res, 200, faults.snapshot()); return;
      }
      sendJson(res, 404, { error: 'Unknown simulation command' });
    } catch (error) { sendJson(res, 500, { error: error.message }); }
  } })));
  record({ type: 'simulation/instrumented', models: config.models });
}
