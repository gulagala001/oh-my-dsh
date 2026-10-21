import React, { useMemo, useState } from 'react';
import { Button, Input, Switch, Tag, IconSkillOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api, query } from './api.mjs';
import { ActionsMenu, Confirm, Detail, Editor, Facts, Field, Group, Page, RefreshButton, Row, ScopePicker, Search, Select, Status, TextArea,
  filter, folderActions, useAction, useOpeners, useResource, useScopes, useT } from './ui.jsx';

const GROUPS = [['project', ['project-dsh', 'project-agents']], ['user', ['user-dsh', 'user-agents']], ['custom', ['custom']], ['bundled', ['bundled']]];
const groupOf = source => GROUPS.find(([, sources]) => sources.includes(source))?.[0] ?? 'runtime';
const ORDER = ['project', 'user', 'custom', 'bundled', 'runtime'];

export function SkillsPage() {
  const t = useT(), { scope, scopes } = useScopes(), opener = useOpeners(), action = useAction();
  const [search, setSearch] = useState(''), [open, setOpen] = useState(null), [editor, setEditor] = useState(null), [removing, setRemoving] = useState(null);
  const list = useResource(() => api(query('/skills', { scope })), [scope]);
  const skills = list.data?.skills ?? [];
  const groups = useMemo(() => {
    const visible = filter(skills, search, ['name', 'description']);
    return ORDER.map(key => [key, visible.filter(skill => groupOf(skill.source) === key)]).filter(([, items]) => items.length);
  }, [skills, search]);
  const write = async (input, success) => {
    const done = await action.run(() => api('/skills', { scope, ...input }), success);
    if (done) await list.reload({ quiet: true });
    return done;
  };
  const toggle = (skill, next) => write({ action: 'invocation', path: skill.path, model: next.model, user: next.user }, t('saved'));
  const current = open && skills.find(skill => skill.path === open);
  const menu = skill => [skill.editable && { id: 'edit', label: t('edit'), run: () => openEditor(skill) },
    ...folderActions(t, opener, skill.directory, task => action.run(task)),
    skill.editable && { id: 'delete', label: t('delete'), run: () => setRemoving(skill) }];
  const openEditor = async skill => {
    const file = await action.run(() => api(query('/skills/file', { scope, path: skill.path })));
    if (file) setEditor({ mode: 'edit', path: skill.path, name: skill.name, content: file.content });
  };
  const location = { location: scope === 'global' ? 'user' : 'project' };
  const header = { start: <><ScopePicker scope={scope} scopes={scopes}/><Search value={search} onChange={setSearch}/></>,
    end: <><RefreshButton busy={list.loading} onClick={() => list.reload()}/>
      <Button variant="outline" size="sm" onClick={() => setEditor({ mode: 'import', source: '', ...location })}>{t('import')}</Button>
      <Button variant="primary" size="sm" icon={<IconPlusOutlineRegular size={13}/>} onClick={() => setEditor({ mode: 'create', name: '', description: '', body: '', ...location })}>{t('skills.new')}</Button></> };
  const dialogs = <>
    {editor && <SkillEditor editor={editor} scope={scope} onClose={() => setEditor(null)} onSaved={async path => { setEditor(null); await list.reload({ quiet: true }); if (path) setOpen(path); }}/>}
    <Confirm open={!!removing} title={t('skills.delete.title')} description={removing ? t('skills.delete.desc', { name: removing.name, path: removing.bundle ? removing.directory : removing.path }) : ''}
      busy={action.busy} error={action.error} onCancel={() => { setRemoving(null); action.clear(); }}
      onConfirm={async () => { if (await write({ action: 'delete', path: removing.path }, t('deleted'))) { setRemoving(null); setOpen(null); } }}/>
  </>;
  if (current) return <>
    <Detail title={current.name} onBack={() => setOpen(null)}
      tags={<Tag tone="quiet">{t(`source.${current.source}`)}</Tag>}
      actions={<>{current.editable && <Button variant="outline" size="sm" onClick={() => openEditor(current)}>{t('edit')}</Button>}<ActionsMenu actions={menu(current).filter(item => item?.id !== 'edit')}/></>}>
      <Status error={action.error} notice={action.notice}/>
      <Facts rows={[[t('skills.description'), current.description], current.whenToUse && [t('skills.whenToUse'), current.whenToUse],
        [t('skills.provider'), current.provider], current.path && [t('path'), <code>{current.path}</code>]]}/>
      <div className="dshx-switches">
        <SwitchRow label={t('skills.model')} hint={t('skills.model.hint')} checked={current.model} disabled={!current.editable || action.busy} onChange={value => toggle(current, { model: value, user: current.user })}/>
        <SwitchRow label={t('skills.user')} hint={t('skills.user.hint')} checked={current.user} disabled={!current.editable || action.busy} onChange={value => toggle(current, { model: current.model, user: value })}/>
        {!current.editable && <p className="dshx-hint">{t('skills.readOnly')}</p>}
      </div>
      <SkillContent scope={scope} path={current.path}/>
    </Detail>{dialogs}</>;
  return <Page {...header} intro={t('skills.intro')} status={<Status error={list.error ?? action.error} notice={action.notice} onRetry={list.error ? () => list.reload() : undefined}/>}>
    {list.loading && !list.data ? <p className="dshx-muted">{t('loading')}</p>
      : !skills.length ? <p className="dshx-empty">{t('skills.empty')}</p>
      : !groups.length ? <p className="dshx-empty">{t('noMatch')}</p>
      : groups.map(([key, items]) => <Group key={key} title={t(`skills.group.${key}`)} count={items.length}>
        {items.map(skill => {
          const enabled = skill.model || skill.user;
          return <Row key={skill.path ?? skill.name} icon={<IconSkillOutlineRegular size={20}/>} title={skill.name} muted={!enabled}
            tags={<>{!enabled && <Tag tone="quiet">{t('skills.stopped')}</Tag>}{key !== 'bundled' && key !== 'runtime' && <Tag tone="quiet">{t(`source.${skill.source}`)}</Tag>}</>}
            description={skill.description} onOpen={() => setOpen(skill.path)}
            end={<><Switch label={t('toggle', { name: skill.name })} checked={enabled} disabled={!skill.editable || action.busy} title={skill.editable ? undefined : t('skills.readOnly')}
              onChange={value => toggle(skill, { model: value, user: value })}/><ActionsMenu actions={menu(skill)}/></>}/>;
        })}
      </Group>)}
    {dialogs}
  </Page>;
}

function SwitchRow({ label, hint, checked, disabled, onChange }) {
  return <div className="dshx-switch-row"><div><strong>{label}</strong><small>{hint}</small></div><Switch label={label} checked={checked} disabled={disabled} onChange={onChange}/></div>;
}

function SkillContent({ scope, path }) {
  const t = useT();
  const file = useResource(() => api(query('/skills/file', { scope, path })), [scope, path]);
  if (file.error) return <Status error={file.error}/>;
  return <section className="dshx-section"><h3 className="dshx-group-title">{t('content')}</h3><pre className="dshx-code">{file.data?.content ?? t('loading')}</pre></section>;
}

function SkillEditor({ editor, scope, onClose, onSaved }) {
  const t = useT(), action = useAction(), [draft, setDraft] = useState(editor);
  const set = key => event => setDraft(current => ({ ...current, [key]: event.target.value }));
  const locations = scope === 'global' ? null : [{ value: 'project', label: t('location.project') }, { value: 'user', label: t('location.user') }];
  const save = async () => {
    const input = draft.mode === 'edit' ? { action: 'save', path: draft.path, content: draft.content }
      : draft.mode === 'import' ? { action: 'import', location: draft.location, source: draft.source }
      : { action: 'create', location: draft.location, name: draft.name.trim(), description: draft.description, body: draft.body };
    const result = await action.run(() => api('/skills', { scope, ...input }));
    if (result) onSaved(result.path ?? draft.path);
  };
  const title = draft.mode === 'edit' ? t('skills.edit.title', { name: draft.name }) : draft.mode === 'import' ? t('skills.import') : t('skills.new');
  return <Editor open title={title} onClose={onClose} onSave={save} busy={action.busy} error={action.error} wide={draft.mode !== 'import'}
    saveLabel={draft.mode === 'import' ? t('import') : draft.mode === 'create' ? t('create') : undefined}>
    {locations && draft.mode !== 'edit' && <Field label={t('location')}><Select label={t('location')} value={draft.location} options={locations} onChange={value => setDraft(current => ({ ...current, location: value }))}/></Field>}
    {draft.mode === 'edit' && <Field label="SKILL.md"><TextArea rows={22} value={draft.content} onChange={set('content')}/></Field>}
    {draft.mode === 'import' && <Field label={t('skills.source')} hint={t('skills.source.hint')}><Input value={draft.source} onChange={set('source')} placeholder="/path/to/skill" data-modal-autofocus/></Field>}
    {draft.mode === 'create' && <>
      <Field label={t('skills.name')} hint={t('skills.name.hint')}><Input value={draft.name} onChange={set('name')} placeholder="code-review" data-modal-autofocus/></Field>
      <Field label={t('skills.description')} hint={t('skills.description.hint')}><TextArea rows={2} value={draft.description} onChange={set('description')}/></Field>
      <Field label={t('skills.body')}><TextArea rows={12} value={draft.body} onChange={set('body')} placeholder={t('skills.body.placeholder')}/></Field>
    </>}
  </Editor>;
}
