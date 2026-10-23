import React, { useRef, useState } from 'react';
import { Button, Checkbox, Choice, Input, Switch } from './native-controls.jsx';
import {
  PERSONALITY_FIELDS, PERSONALITY_PRESETS, PERSONALITY_FILE_LIMIT, personalityPreset, personalityOptions, personalityProfile,
  personalityPatch, customPersonalityPatch, savePersonalityPreset, deletePersonalityPreset,
  personalityCreatorPrompt, exportPersonalityFile, importPersonalityFile,
} from '../shared/personality.mjs';

const NEW = '__new__';
const own = (value, key) => Object.hasOwn(value, key);
const asDraft = profile => ({ name: profile.name, description: profile.description || '', modules: { ...profile.modules } });

async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; } } catch {}
  // Clipboard API is unavailable on HTTP profiles; keep the fallback in the click gesture.
  const active = document.activeElement, selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const field = document.createElement('textarea');
  field.value = text; field.setAttribute('aria-hidden', 'true'); field.tabIndex = -1;
  Object.assign(field.style, { position: 'fixed', top: '0', left: '-10000px', opacity: '0' });
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand('copy')) throw Error('复制失败，请检查浏览器剪贴板权限后重试');
  } finally {
    field.remove(); active?.focus?.({ preventScroll: true });
    if (selection && ranges.length) { selection.removeAllRanges(); ranges.forEach(range => selection.addRange(range)); }
  }
}

function Row({ title, hint, children }) {
  return <div className="dsp-set-row"><div className="dsp-set-line">
    <div className="dsp-set-copy"><strong>{title}</strong>{hint && <small>{hint}</small>}</div>
    {children && <div className="dsp-set-control">{children}</div>}
  </div></div>;
}

export function Personality({ config, commit }) {
  const preset = personalityPreset(config);
  const [managed, setManaged] = useState(() => preset === 'off' ? 'custom' : preset);
  const [drafts, setDrafts] = useState({}), [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState({ text: '', error: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef(null), lock = useRef(false);
  const options = personalityOptions(config);
  const managerOptions = options.filter(option => option.value !== 'off');
  for (const [id, draft] of Object.entries(drafts)) {
    if (id !== NEW && !managerOptions.some(option => option.value === id))
      managerOptions.push({ value: id, label: draft.name + '（已删除，草稿保留）' });
  }
  if (managed === NEW || own(drafts, NEW)) managerOptions.push({ value: NEW, label: '未保存的新预设' });
  const effectiveId = managerOptions.some(option => option.value === managed) ? managed : 'custom';
  const missing = effectiveId !== NEW && !options.some(option => option.value === effectiveId);
  const source = effectiveId === NEW ? { name: '', description: '', modules: { identity: '' } }
    : missing ? drafts[effectiveId] : personalityProfile(config, effectiveId);
  const draft = drafts[effectiveId] ?? asDraft(source);
  const builtin = own(PERSONALITY_PRESETS, effectiveId), saved = !missing && effectiveId.startsWith('user:');
  const dirty = own(drafts, effectiveId);
  const update = patch => {
    setDrafts(current => ({ ...current, [effectiveId]: { ...draft, ...patch } }));
    setNotice({ text: '', error: false }); setConfirmDelete(false);
  };
  const updateModule = (key, value) => update({ modules: { ...draft.modules, [key]: value } });
  const clearDraft = id => setDrafts(current => { const next = { ...current }; delete next[id]; return next; });
  const run = async (operation, success) => {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setNotice({ text: '', error: false });
    try {
      await operation();
      setNotice({ text: success, error: false }); return true;
    } catch (error) { setNotice({ text: error.message || '操作失败，请重试', error: true }); return false; }
    finally { lock.current = false; setBusy(false); }
  };
  const persist = async patch => {
    if (await commit(patch, config) === false) throw Error('保存失败，请核对最新设置后重试；编辑内容已保留');
  };
  const save = () => run(async () => {
    const id = effectiveId;
    if (id === 'custom') {
      const patch = customPersonalityPatch(draft);
      if (preset !== 'custom') { delete patch.identityPreset; delete patch.identityPrompt; }
      await persist(patch);
    }
    else {
      const patch = savePersonalityPreset(config, { ...draft, ...(saved ? { id } : {}) }, { activate: false });
      await persist(patch);
      if (!saved) {
        const previousIds = new Set((config.identitySavedPresets || []).map(item => item.id));
        setManaged(patch.identitySavedPresets.find(item => !previousIds.has(item.id)).id);
      }
    }
    clearDraft(id);
  }, effectiveId === 'custom' ? '自定义人格已保存' : '预设已保存');
  const uniqueName = base => {
    const used = new Set(options.map(option => option.label.normalize('NFC').toLocaleLowerCase('en-US')));
    let name = base.slice(0, 80), index = 2;
    while (used.has(name.normalize('NFC').toLocaleLowerCase('en-US'))) {
      const suffix = ` ${index++}`; name = base.slice(0, 80 - suffix.length) + suffix;
    }
    return name;
  };
  const startNew = duplicate => {
    if (own(drafts, NEW)) { setManaged(NEW); setConfirmDelete(false); return; }
    const next = duplicate ? { ...draft, name: uniqueName(`${draft.name || source.name || '人设'} 副本`), modules: { ...draft.modules } }
      : { name: uniqueName('新人设'), description: '', modules: { identity: '' } };
    setDrafts(current => ({ ...current, [NEW]: next })); setManaged(NEW);
    setConfirmDelete(false); setNotice({ text: '', error: false });
  };
  const reference = () => dirty || effectiveId === NEW
    ? { config: { ...config, ...customPersonalityPatch(draft) }, id: 'custom' }
    : { config, id: effectiveId };
  const copyCreator = () => run(async () => {
    const value = reference(); await copyText(personalityCreatorPrompt(value.config, value.id));
  }, '创作提示词已复制，可交给 AI 生成人格 JSON 文件后导入');
  const exportFile = () => run(async () => {
    const value = reference(), content = JSON.parse(exportPersonalityFile(value.config, value.id));
    content.name = draft.name.trim() || source.name || '新人设';
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url;
    link.download = content.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') + '.personality.json';
    document.body.append(link);
    try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }, '人格文件已导出');
  const importFile = event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    void run(async () => {
      if (file.size > PERSONALITY_FILE_LIMIT) throw Error('人格文件不能超过 1 MiB');
      const patch = importPersonalityFile(config, await file.text());
      await persist(patch); setManaged(patch.identityPreset); setConfirmDelete(false);
    }, '人格文件已导入并设为全局人格');
  };
  const remove = () => run(async () => {
    const id = effectiveId; await persist(deletePersonalityPreset(config, id));
    clearDraft(id); setManaged('custom'); setConfirmDelete(false);
  }, '预设已删除');
  return <>
    <Row title="人格预设" hint="作为全局默认人格，保存的预设可随时切换。">
      <Choice aria-label="人格预设" value={preset} options={options} disabled={busy}
        onChange={value => void run(() => persist(personalityPatch(config, value)), '全局人格已切换')}/>
    </Row>
    <details className="dsp-set-advanced dsp-set-personality-advanced">
      <summary>高级</summary>
      <Row title="启用会话人设" hint="允许在各会话中单独选择人格；关闭后统一使用全局人格。">
        <Switch label="启用会话人设" checked={config.sessionPersonalityEnabled === true} disabled={busy}
          onChange={value => void run(() => persist({ sessionPersonalityEnabled: value }), value ? '已启用会话人设' : '已关闭会话人设')}/>
      </Row>
      <Row title="编辑人设" hint="选择编辑对象不会切换全局人格。">
        <Choice aria-label="编辑人设" value={effectiveId} options={managerOptions} disabled={busy} onChange={value => {
          setManaged(value); setConfirmDelete(false); setNotice({ text: '', error: false });
        }}/>
      </Row>
      <div className="dsp-set-row dsp-set-personality-editor">
        <div className="dsp-set-actions dsp-set-personality-tools">
          <Button type="button" size="sm" variant="outline" disabled={busy || effectiveId === NEW} onClick={() => startNew(false)}>{own(drafts, NEW) ? '继续编辑新人设' : '新建人设'}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy || own(drafts, NEW)} onClick={() => startNew(true)}>复制为新人设</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={copyCreator}>复制创作提示词</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>导入人格文件</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={exportFile}>导出人格文件</Button>
          <input ref={fileInput} hidden type="file" accept=".json,application/json" aria-label="导入人格 JSON 文件" onChange={importFile}/>
        </div>
        <p className="dsp-set-personality-hint">仅调整身份、语言风格、沟通与回答呈现。可复制创作提示词交给 AI，生成 JSON 文件后导入。</p>
        {builtin && <p className="dsp-set-personality-hint">内置预设只读，复制为新人设后可修改。</p>}
        {missing && <p className="dsp-set-personality-hint">该预设已在另一处删除，编辑内容仍在；可保存为新预设。</p>}
        <div className="dsp-set-fields">
          <label className="dsp-set-field"><span>预设名称</span><Input aria-label="预设名称" value={draft.name} maxLength={80} readOnly={builtin || effectiveId === 'custom'} disabled={busy}
            placeholder="为这份人设起个名字" onChange={event => update({ name: event.target.value })}/></label>
          <label className="dsp-set-field"><span>简介</span><Input aria-label="人设简介" value={draft.description} maxLength={1000} readOnly={builtin} disabled={busy}
            placeholder="简要说明这份人设" onChange={event => update({ description: event.target.value })}/></label>
        </div>
        <div className="dsp-set-personality-modules">
          {PERSONALITY_FIELDS.map(field => {
            const inherited = field.key !== 'identity' && !own(draft.modules, field.key);
            return <div className="dsp-set-personality-module" key={field.key}>
              <div className="dsp-set-line"><strong>{field.label}</strong>{field.key !== 'identity' && <Checkbox label="继承默认" checked={inherited} disabled={builtin || busy} onChange={checked => {
                const modules = { ...draft.modules };
                if (checked) delete modules[field.key]; else modules[field.key] = field.defaultText;
                update({ modules });
              }}/>}</div>
              <label className="dsp-set-field"><small>{field.hint}</small>
                <textarea aria-label={field.label} rows={field.key === 'identity' ? 6 : 4} maxLength={65536} disabled={busy} readOnly={builtin || inherited}
                  value={inherited ? field.defaultText : draft.modules[field.key] ?? ''} onChange={event => updateModule(field.key, event.target.value)}/>
                {inherited && <small>随默认内容更新；取消继承后可修改，留空表示清空本模块。</small>}
              </label>
            </div>;
          })}
        </div>
        <div className="dsp-set-actions">
          {dirty && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => {
            clearDraft(effectiveId); if (effectiveId === NEW) setManaged('custom'); setConfirmDelete(false); setNotice({ text: '', error: false });
          }}>放弃修改</Button>}
          {!builtin && <Button type="button" size="sm" variant="primary" disabled={busy || !dirty || !draft.name.trim()} onClick={save}>{busy ? '处理中…' : saved ? '更新预设' : effectiveId === 'custom' ? '保存自定义' : '保存新预设'}</Button>}
          {saved && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>删除预设</Button>}
        </div>
        {confirmDelete && <div className="dsp-set-personality-delete" role="alert">
          <span>删除“{source.name}”？{preset === effectiveId ? '当前全局人格会保留为自定义。' : '删除后无法恢复。'}</span>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>取消</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={remove}>确认删除</Button>
        </div>}
        {notice.text && <div className={'dsp-set-status' + (notice.error ? ' dsp-set-error' : '')} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span></div>}
      </div>
    </details>
  </>;
}
