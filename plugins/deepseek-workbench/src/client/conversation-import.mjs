/** One captured request owns extraction, submission and receipt recovery. */
export class ConversationImport {
  request = null;
  completed = null;
  pending = null;

  run(readConversation, submit, stage = () => {}) {
    if (this.pending) return this.pending;
    this.pending = Promise.resolve().then(async () => {
      if (!this.request) {
        stage('extract');
        const conversation = await readConversation();
        if (!conversation?.messages?.length) throw Error('未找到可以迁移的消息。');
        if (this.completed?.fingerprint === JSON.stringify(conversation)) return this.completed.result;
        this.request = { requestId: crypto.randomUUID(), conversation };
      }
      // A failed or unacknowledged submission retries these exact bytes. A new
      // extraction can carry changed signed URLs, warnings or later messages.
      stage('import');
      const result = await submit(this.request);
      if (typeof result?.sessionId !== 'string' || !result.sessionId || typeof result.title !== 'string') throw Error('迁移回执无效，请重试确认结果。');
      this.completed = { fingerprint: JSON.stringify(this.request.conversation), result };
      this.request = null;
      return result;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }
}
