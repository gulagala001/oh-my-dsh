export function compactionMessage(operation, outcome) {
  const label = operation === 'full' ? '全量压缩' : '已处理片段仅摘要';
  if (outcome.queued) return label + '已排队，将在下一次请求边界执行。';
  if (!outcome.changed) return operation === 'full' ? '没有可压缩的对话内容，原文保持不变。' : '没有需要切换的已处理片段，现有摘要和未处理原文保持不变。';
  if (operation === 'full') return '已全量压缩为一份摘要；系统提示词、工具定义和用户手写全局背景保留。原始日志仍可回查。';
  const count = outcome.result?.operations?.filter(o => o.kind === 'record').length || 0;
  return `已将 ${count} 段已处理内容切换为仅摘要；详细文档退出当前上下文，存档保留。`;
}

export function registerContextCommands(ctx, hub) {
  const commands = [
    ['compact-p', 'processed', '已处理片段仅摘要：全部已准备片段改为纯摘要，不调用模型'],
    ['compact-f', 'full', '全量压缩：保留必要提示词，将整个对话重新汇总为一份摘要'],
  ];
  for (const [name, operation, description] of commands) ctx.effect(() => ctx.commands.register({
    name, description,
    async handler({ agent, signal, commandId, rawInput }) {
      if (rawInput.trim()) return { kind: 'error', text: `用法：/${name}（不接受参数）` };
      try {
        const outcome = await hub.context.requestCompaction(agent.session, agent, operation, { signal, sourceCommandId: commandId });
        return { kind: 'success', text: compactionMessage(operation, outcome),
          ...(outcome.result?.summarySeq != null ? { sourceEventSeq: outcome.result.summarySeq } : {}) };
      } catch (error) {
        return { kind: 'error', text: signal?.aborted ? '压缩已取消；请查看上下文状态。' : error.message };
      }
    },
  }));
}
