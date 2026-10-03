export const DRAFT_RECOVERY_PREFIX = 'omd.draft-recovery.v1.';

export function decodeLegacyDraft(value) {
  if (!value || typeof value !== 'object' || typeof value.text !== 'string') return null;
  let end = 0;
  const valid = Array.isArray(value.references) && value.references.every(ref => {
    if (!ref || !['source', 'ref', 'label', 'clipboardText'].every(key => typeof ref[key] === 'string')
      || !Number.isSafeInteger(ref.offset) || !Number.isSafeInteger(ref.length) || ref.offset < end || ref.length <= 0
      || ref.length !== ref.clipboardText.length || value.text.slice(ref.offset, ref.offset + ref.length) !== ref.clipboardText
      || ref.offset + ref.length > value.text.length
      || ref.appearance !== undefined && !['file', 'folder', 'session'].includes(ref.appearance)
      || ref.invalid !== undefined && typeof ref.invalid !== 'boolean') return false;
    end = ref.offset + ref.length;
    return true;
  });
  return { text: value.text, occurrences: valid ? value.references.map(ref => ({ ...ref })) : [], invalidReferences: !valid };
}

// Keep the complete original browser record, including unknown fields. Never
// rewrite the host's primary cache or discard an earlier recovery record.
export function preserveLegacyDraft(storage, sessionId, value) {
  const key = DRAFT_RECOVERY_PREFIX + sessionId;
  const raw = storage.getItem('dsh.conversation.' + sessionId) ?? JSON.stringify({ draft: value });
  const saved = storage.getItem(key);
  const records = saved === null ? [] : JSON.parse(saved);
  if (!Array.isArray(records) || records.some(record => typeof record !== 'string')) throw Error('Invalid draft recovery cache');
  const additions = [raw];
  // A concurrent writer or programmatic seed may differ from the current cache.
  // Preserve the incoming snapshot too, rather than backing up only newer data.
  let cachedDraft;
  try { cachedDraft = JSON.stringify(JSON.parse(raw).draft); } catch {}
  if (cachedDraft !== JSON.stringify(value)) additions.push(JSON.stringify({ draft: value }));
  const next = [...new Set([...records, ...additions])];
  if (next.length !== records.length) storage.setItem(key, JSON.stringify(next));
}

export function restoreLegacyDraft({ value, sessionId, storage, getStorage = () => storage, shell, setDraft }) {
  if (typeof value === 'string') { setDraft(value); return; }
  try { preserveLegacyDraft(getStorage(), sessionId, value); }
  catch { shell.notify('error', '草稿备份无法保存，原缓存未改动。'); }
  const draft = decodeLegacyDraft(value);
  if (!draft) { shell.notify('error', '已保存的草稿格式无法识别，原稿已保留。'); return; }
  shell.restoreDraft({ draft: draft.text, occurrences: draft.occurrences, attachmentIds: shell.captureDraft().attachmentIds });
  if (draft.invalidReferences) shell.notify('info', '草稿文本已恢复，无法识别的引用保留在草稿备份中。');
}

// rc.2's slot seed is text-only. Adapt its pinned input hub without replacing
// the session renderer, its child-slot declarations, store, or draft mirror.
export function applyLegacyDraftRecovery(ctx) {
  const input = ctx.get('conversation').input;
  ctx.effect(() => {
    const original = input.shellFor, patched = new Map();
    function shellFor(binding) {
      const shell = original.call(this, binding);
      if (!patched.has(shell)) {
        const native = shell.actions.setDraft;
        const adapted = value => restoreLegacyDraft({ value, sessionId: binding.session.sessionId,
          getStorage: () => globalThis.localStorage, shell, setDraft: native });
        shell.actions.setDraft = adapted;
        patched.set(shell, { native, adapted });
        binding.ctx.effect(() => () => {
          if (shell.actions.setDraft === adapted) shell.actions.setDraft = native;
          patched.delete(shell);
        });
      }
      return shell;
    }
    input.shellFor = shellFor;
    return () => {
      if (input.shellFor === shellFor) input.shellFor = original;
      for (const [shell, { native, adapted }] of patched) {
        if (shell.actions.setDraft === adapted) shell.actions.setDraft = native;
      }
      patched.clear();
    };
  });
}
