const emptyLimits = () => ({ tokens: null, rounds: null, timeMs: null });
const freshBudget = () => ({ limits: emptyLimits(), tokens: 0, rounds: 0, elapsedMs: 0, unmetered: 0, configured: false, visible: true });
const aliases = { token: 'tokens', tokens: 'tokens', 总token: 'tokens', 轮次: 'rounds', rounds: 'rounds', 时间: 'timeMs', time: 'timeMs' };
const usage = '用法：/预算 token=100k 轮次=30 时间=20m（三项任选）；查看、重置、关闭；单项设为“无限制”可清除上限。';

export function parseBudgetInput(input = '') {
  const text = input.trim();
  if (!text || /^(查看|show)$/i.test(text)) return { op: 'show' };
  if (/^(重置|reset)$/i.test(text)) return { op: 'reset' };
  if (/^(关闭|off)$/i.test(text)) return { op: 'off' };
  if (/^(无限制|unlimited)$/i.test(text)) return { op: 'set', limits: emptyLimits() };
  const limits = {};
  for (const part of text.split(/\s+/)) {
    const match = /^([^=＝]+)[=＝](.+)$/.exec(part), key = aliases[match?.[1].toLowerCase()];
    if (!key || Object.hasOwn(limits, key)) throw Error(usage);
    const value = match[2].toLowerCase();
    if (['无限制', 'unlimited', 'off'].includes(value)) { limits[key] = null; continue; }
    const number = /^(\d+(?:\.\d+)?)([a-z分钟小时秒轮]*)$/.exec(value);
    if (!number) throw Error(usage);
    const units = key === 'tokens' ? { '': 1, k: 1000, m: 1000000 }
      : key === 'rounds' ? { '': 1, 轮: 1 } : { s: 1000, 秒: 1000, m: 60000, 分钟: 60000, h: 3600000, 小时: 3600000 };
    const amount = Number(number[1]) * units[number[2]];
    if (!Number.isSafeInteger(amount) || amount <= 0) throw Error(usage);
    limits[key] = amount;
  }
  return { op: 'set', limits };
}

export function renderBudget(budget) {
  if (!budget || budget.visible === false) return '';
  const { limits } = budget;
  if (Object.values(limits).every(value => value == null)) return '预算：无限制';
  const format = value => value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  const row = (label, used, limit, scale = 1, unit = '') => `${label}：${format(used / scale)}${unit} / ${limit == null ? '无限制' : `${format(limit / scale)}${unit}（${format(used / limit * 100)}%）`}`;
  return ['预算', row('Token', budget.tokens, limits.tokens), row('模型轮次', budget.rounds, limits.rounds),
    row('执行时间', budget.elapsedMs, limits.timeMs, 60000, ' 分钟'),
    ...(budget.unmetered ? [`另有 ${budget.unmetered} 次调用未返回 token 用量。`] : [])].join('\n');
}

// Counters persist with the session; open clock intervals are process-local so
// downtime never consumes a time budget. Reading a snapshot never invokes a model.
export class TaskBudgets {
  constructor(hub, now = Date.now) { this.hub = hub; this.now = now; this.clocks = new Map(); this.waiting = new Map(); }
  saved(session) { return this.hub.store.state(session.id).budget; }
  save(session, budget) { const state = this.hub.store.state(session.id); state.budget = budget; this.hub.store.save(state); }
  tick(session, running, now = this.now()) {
    const budget = this.saved(session), since = this.clocks.get(session.id);
    this.clocks.delete(session.id);
    if (!budget?.configured || !budget.visible) return;
    if (since != null) { budget.elapsedMs += Math.max(0, now - since); this.save(session, budget); }
    if (running && !this.waiting.get(session.id)) this.clocks.set(session.id, now);
  }
  snapshot(session, now = this.now()) {
    const budget = this.saved(session) ?? freshBudget(), since = this.clocks.get(session.id);
    return { ...budget, limits: { ...budget.limits }, elapsedMs: budget.elapsedMs + (since == null ? 0 : Math.max(0, now - since)) };
  }
  command(agent, input) {
    const action = parseBudgetInput(input), session = agent.session;
    if (action.op === 'show') return renderBudget(this.snapshot(session)) || '本会话预算已关闭。';
    let budget = this.snapshot(session);
    this.clocks.delete(session.id);
    if (action.op === 'off') budget.visible = false;
    else if (action.op === 'reset') budget = { ...freshBudget(), limits: budget.limits, configured: true };
    else {
      if (!budget.configured || !budget.visible) budget = freshBudget();
      budget = { ...budget, configured: true, visible: true, limits: { ...budget.limits, ...action.limits } };
    }
    this.save(session, budget);
    this.tick(session, agent.status === 'running');
    const text = renderBudget(budget) || '本会话预算已关闭。';
    return text + (!this.hub.config().budgetHintsEnabled ? '\n在设置 → Oh My DSH → 实验性功能中开启“向模型提供预算”后投递。' : '');
  }
  record(session, kind, entry) {
    // Attribute delegated and background token usage to an already configured
    // ancestor budget too; only the owning session's main calls consume rounds.
    const seen = new Set(); let id = session.id;
    while (id && !seen.has(id)) {
      seen.add(id);
      const state = this.hub.store.state(id), budget = state.budget;
      if (budget?.configured && budget.visible) {
        if (id === session.id && kind === 'main') budget.rounds++;
        if (entry.usage) for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens']) {
          const value = entry.usage[key]; if (Number.isFinite(value) && value >= 0) budget.tokens += value;
        }
        else budget.unmetered++;
        this.hub.store.save(state);
      }
      id = state.parentSession;
    }
  }
  async waitForUser(agent, next) {
    const session = agent.session, id = session.id;
    this.tick(session, false);
    this.waiting.set(id, (this.waiting.get(id) ?? 0) + 1);
    try { return await next(); }
    finally {
      if (this.waiting.has(id)) {
        const depth = this.waiting.get(id) - 1;
        if (depth) this.waiting.set(id, depth); else this.waiting.delete(id);
        this.tick(session, agent.status === 'running');
      }
    }
  }
  dispose(session) { this.tick(session, false); this.waiting.delete(session.id); }
}

export function registerBudgetCommand(ctx, hub) {
  ctx.effect(() => ctx.commands.register({ name: 'budget', description: '预算：设置总 token、模型轮次、执行时间；未设置为无限制',
    input: { hint: 'token=100k 轮次=30 时间=20m；查看 / 重置 / 关闭' },
    handler({ agent, rawInput }) {
      try { return { kind: 'success', text: hub.budgets.command(agent, rawInput) }; }
      catch (error) { return { kind: 'error', text: error.message }; }
    },
  }));
}

// The pinned host only parses ASCII command names. Handle the exact Chinese
// alias before admission, through the same native executor and lifecycle log.
export async function consumeBudgetAliases(agent, messages, signal) {
  const consumed = new Set(), commands = agent.ctx?.get('commands');
  if (!commands) return consumed;
  for (const message of messages) {
    if (message.source?.kind !== 'user' || message.content.length !== 1 || message.content[0].type !== 'text') continue;
    const text = message.content[0].text;
    if (!/^\/预算(?=\s|$)/u.test(text)) continue;
    if (await commands.execute(agent, text.replace(/^\/预算/u, '/budget'), [], signal)) consumed.add(message.id);
  }
  return consumed;
}
