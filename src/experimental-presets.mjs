import { join } from 'node:path';

export const UNHARNESSED_PRESET = 'omd-unharnessed';
export const isUnharnessedPreset = id => id === 'unharnessed' || id === UNHARNESSED_PRESET;
export const UNHARNESSED_SETTING = 'experimentalUnharnessedEnabled';

export function unharnessedDefinition(directory) {
  return {
    id: UNHARNESSED_PRESET, name: 'Unharnessed（实验）', order: 2,
    description: '持久 Python、跨重启检查点、MCP、附件、后台命令与目标验收。',
    plugins: [
      { id: 'native-executor', name: '@deepseek-ai/dsh-tool-executor-native' },
      { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
      { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
      { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
      { id: 'unharnessed', name: 'oh-my-dsh/unharnessed', isolate: { omdUnharnessedRuntime: true },
        config: { stateDirectory: join(directory, 'unharnessed-state') } },
      { id: 'compaction', name: 'cordis:group', group: true, isolate: { compaction: true }, config: [
        { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      ] },
    ],
  };
}

export class ExperimentalPresets {
  constructor(ctx, hub) {
    this.ctx = ctx; this.hub = hub; this.tail = Promise.resolve(); this.error = '';
    this.definition = unharnessedDefinition(hub.store.dir);
    const denied = agent => agent?.session && this.owns(agent.session) && !this.enabled()
      ? '请先在设置 → Oh My DSH → 实验预设中开启 Unharnessed。会话记录与检查点已保留。' : undefined;
    ctx.tools.guard(exec => denied(exec.agent));
    ctx.on('agent/request', ({ agent }, next) => {
      const reason = denied(agent); if (reason) throw Error(reason); return next();
    }, { global: true, prepend: true });
    ctx.on('app-boot/config-reload', () => {
      if (!this.writing) void this.start();
    }, { global: true });
  }
  owns(session) {
    return (this.ctx.sessionProjections.stateOf(session, 'agentPreset') ?? session.header.agentPreset) === UNHARNESSED_PRESET;
  }
  enabled() { return !!this.unregister && !this.error && !this.changing && !this.closed && this.hub.config()[UNHARNESSED_SETTING] === true; }
  inspect() { return { enabled: this.enabled(), error: this.error, preset: UNHARNESSED_PRESET }; }
  enqueue(run) { const work = this.tail.then(run); this.tail = work.catch(() => {}); return work; }
  assertCanDisable() {
    if (this.ctx.agentPresets.defaultId === UNHARNESSED_PRESET) throw Error('请先在 Agent 预设设置中选择其他默认预设，再关闭 Unharnessed。');
    const busy = this.ctx.agents.list().some(agent => this.owns(agent.session) && (
      agent.status === 'running' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length
      || this.ctx.get('jobs')?.list(agent.id).some(job => ['running', 'stopping'].includes(job.status))
      || this.ctx.get('goals')?.get(agent)?.phase === 'active'
      || this.ctx.agentPresets.serviceFor(agent, 'omdUnharnessedRuntime')?.busy()
    ));
    if (busy) throw Error('Unharnessed 仍有运行或排队的任务、后台命令或活动目标，请停止并等待结束后再关闭。');
  }
  async reconcile(enabled) {
    if (enabled) {
      if (this.unregister && (await this.ctx.agentPresets.resolve(UNHARNESSED_PRESET)).broken) {
        await this.unregister(); this.unregister = undefined;
      }
      if (!this.unregister) this.unregister = await this.ctx.agentPresets.register(this.definition);
      const preset = await this.ctx.agentPresets.resolve(UNHARNESSED_PRESET);
      if (preset.broken) throw Error(preset.broken);
    } else if (this.unregister) {
      await this.unregister(); this.unregister = undefined;
    }
  }
  start() {
    return this.enqueue(async () => {
      if (this.closed) return;
      const enabled = this.hub.config()[UNHARNESSED_SETTING] === true;
      try {
        if (!enabled && this.unregister) this.assertCanDisable();
        await this.reconcile(enabled); this.error = '';
      } catch (error) {
        // An optional preset failure must not take down OMD's main runtime.
        this.error = 'Unharnessed 预设不可用：' + error.message;
        this.ctx.logger.warn(this.error);
      }
    });
  }
  update(patch) {
    return this.enqueue(async () => {
      if (this.closed) throw Error('实验预设服务已停止');
      const next = patch[UNHARNESSED_SETTING];
      if (typeof next !== 'boolean') throw Error('实验预设开关必须为开或关');
      const previous = this.hub.config()[UNHARNESSED_SETTING] === true;
      if (!next) this.assertCanDisable();
      this.changing = true; this.writing = true;
      try {
        await this.reconcile(next);
        if (this.closed) throw Error('实验预设服务已停止');
        await this.ctx.settings.update('oh-my-dsh', patch);
        this.error = '';
      } catch (error) {
        try { await this.reconcile(previous); }
        catch (rollback) {
          this.error = '实验预设恢复失败：' + rollback.message;
          throw new AggregateError([error, rollback], error.message + '；' + this.error);
        }
        throw error;
      } finally { this.changing = false; this.writing = false; }
    });
  }
  async close() { this.closed = true; await this.tail; await this.reconcile(false); }
}

export function installExperimentalPresets(ctx, hub) {
  ctx.inject(['agentPresets'], async scope => {
    const control = new ExperimentalPresets(scope, hub);
    hub.experimentalPresets = control;
    scope.effect(() => () => { if (hub.experimentalPresets === control) delete hub.experimentalPresets; return control.close(); });
    await control.start();
  });
}
