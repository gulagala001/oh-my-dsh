import { PROBE_ASK_SYSTEM, PROBE_ANSWER_SYSTEM } from './prompts.mjs';
import { message, contentText, eventText, substantive } from './hub.mjs';

export function normalizeAnswer(s) {
  return String(s ?? '').toLowerCase()
    // 全角数字/字母 → 半角；乘号 ×/✕/ｘ → x（真机：期望「900x600」实得「900×600 像素」曾被误判失败）
    .replace(/[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[×✕✖⨯]/g, 'x')
    .replace(/(?<!\d)\.|\.(?!\d)/g, '')
    .replace(/[\s,，。、；;：:！!？?'"「」『』（）()[\]【】<>《》—\-–_*`~]/g, '')
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** 数字边界包含：needle 在 hay 中出现且两侧不是数字——"8080" 命中「端口 8080」，
 *  但 "3" 不命中 "13"、"8080" 不命中 "18080"、"v2" 不命中 "v20"（裸 includes 对短数字答案零边界，误判通过）。 */
const boundedIncludes = (hay, needle) => new RegExp(`(?<![0-9])${escapeRe(needle)}(?![0-9])`).test(hay)

/** 判分：got 为空/UNKNOWN 判负；否则归一化后按数字边界互相包含即判对（"8080" vs "端口 8080" 都算）。 */
export function judgeProbe(expected, got) {
  const rawGot = String(got ?? '').trim()
  if (!rawGot || /^unknown$/i.test(rawGot)) return false
  const a = normalizeAnswer(expected)
  const b = normalizeAnswer(rawGot)
  if (!a || !b) return false
  return boundedIncludes(a, b) || boundedIncludes(b, a)
}

export const RECORD_PROBE = {
  name: 'record_probe', description: 'Record one factual question and its reference answer.',
  parameters: { type: 'object', required: ['question', 'expected'], properties: {
    question: { type: 'string', description: 'The question' },
    expected: { type: 'string', description: 'The reference answer (as short as possible)' },
  } },
};
export function digestMaterial(state, lo, hi) {
  return state.digests.filter(d => d.from >= lo && d.to <= hi && d.summary.trim()).map(d => `[seq ${d.from}..${d.to}] ${d.summary}`).join('\n');
}
export class Prober {
  constructor(hub, canvas) { this.hub = hub; this.canvas = canvas; this.jobs = new Set(); this.latest = new Map(); this.controllers = new Map(); }
  notes(session) { return [...(this.hub.store.state(session.id).probeNotes || [])]; }
  consume(session, lines, checkpoint) {
    const state = this.hub.store.state(session.id);
    const retained = new Set(lines.filter(line => {
      const i = line.lastIndexOf(' → ');
      return checkpoint.includes(line) || judgeProbe(i >= 0 ? line.slice(i + 3) : line, checkpoint);
    }));
    state.probeNotes = (state.probeNotes || []).filter(line => !retained.has(line));
    this.hub.store.save(state);
  }
  run(agent, lo, hi, checkpointText, compactionId, signal) {
    if (!this.hub.config().probeEnabled) return Promise.resolve();
    const controller = new AbortController(); this.controllers.set(controller, agent.session.id);
    const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const job = this.probe(agent, lo, hi, checkpointText, compactionId, joined).finally(() => { this.jobs.delete(job); this.controllers.delete(controller); if (this.latest.get(agent.session.id) === job) this.latest.delete(agent.session.id); });
    this.jobs.add(job); this.latest.set(agent.session.id, job); return job;
  }
  async probe(agent, lo, hi, checkpointText, compactionId, signal) {
    const session = agent.session, cfg = this.hub.config(), state = this.hub.store.state(session.id), start = Date.now();
    let info;
    try {
      const draft = digestMaterial(state, lo, hi);
      let material = draft || session.snapshotEvents().filter(e => e.seq >= lo && e.seq <= hi && substantive(e)).map(e => `[seq ${e.seq} ${e.type}] ${eventText(session, e)}`).join('\n');
      if (cfg.probeSourceChars > 0) material = material.slice(0, cfg.probeSourceChars);
      if (!material.trim()) throw new Error('no-material');
      const budget = cfg.probeMaxTokens > 0 ? { maxTokens: cfg.probeMaxTokens } : {};
      const ask = await this.hub.call(agent, 'probeAsk', { ...budget, system: PROBE_ASK_SYSTEM + ' Submit the question and reference answer using record_probe.', messages: [message(`Material (${draft ? 'pre-condensed draft' : 'verbatim excerpt'} of the condensed span seq ${lo}..${hi}):\n${material}`)], tools: [RECORD_PROBE] }, signal);
      const call = ask.blocks.findLast(b => b.type === 'tool-call' && b.name === RECORD_PROBE.name);
      const q = call && (typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments);
      const question = q?.question?.trim(), expected = q?.expected?.trim();
      if (!question || !expected) throw new Error('bad-question');
      const answer = await this.hub.call(agent, 'probeAnswer', { ...budget, system: PROBE_ANSWER_SYSTEM, messages: [message(`Text:\n${checkpointText}\n\nQuestion: ${question}`)] }, signal);
      signal.throwIfAborted();
      const got = contentText(answer.blocks).trim(), ok = judgeProbe(expected, got);
      info = { ok, question, expected, got, from: lo, to: hi, source: draft ? 'memory-digest' : 'raw', durationMs: Date.now() - start };
      if (!ok) {
        const line = `${question} → ${expected}`;
        state.probeNotes ??= []; if (!state.probeNotes.includes(line)) state.probeNotes.push(line);
        info.patched = 'pending';
        if (cfg.probePatch !== 'ride') {
          const old = session.surface.nodes.map(seq => session.eventAt(seq)).find(e => e.type === 'user/message' && e.data.source.compactionId === compactionId);
          if (old) {
            try {
              const original = eventText(session, old), head = '[Addendum · key facts from the condensed span]';
              const patch = cfg.probePatch === 'material' ? (cfg.probePatchChars > 0 ? material.slice(0, cfg.probePatchChars) : material) : `- ${line}`;
              const text = original + (original.includes(head) ? '\n' : '\n\n' + head + '\n') + patch;
              await this.canvas.patchCheckpoint(agent, old, text, signal);
              // Only erase a correction that actually appears in the resulting checkpoint.
              if (cfg.probePatch === 'qa' || text.includes(expected)) state.probeNotes = state.probeNotes.filter(n => n !== line);
              info.patched = true;
            } catch (error) { info.patchError = error.message; }
          }
        }
        this.hub.ctx.logger.warn(`探针验收未过 seq ${lo}..${hi}：问「${question}」期望「${expected}」实得「${got}」`);
      }
      this.hub.action(session, ok ? 'probePassed' : 'probeFailed', 1, info);
    } catch (error) {
      info = { ok: false, error: error.message, from: lo, to: hi, durationMs: Date.now() - start };
      if (!signal.aborted) { this.hub.action(session, 'probeErrors', 1, info); this.hub.ctx.logger.warn(`探针作业：${error.message}`); }
    }
    state.probe = info; this.hub.store.save(state); return info;
  }
  dispose(id) { for (const [c, sid] of this.controllers) if (!id || sid === id) c.abort(); }
}
