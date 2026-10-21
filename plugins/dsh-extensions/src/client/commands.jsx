import React, { useMemo, useState } from 'react';
import { Button, Input, Tag, IconCodeOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api, query } from './api.mjs';
import { ActionsMenu, Confirm, Editor, Field, Group, Page, RefreshButton, Row, ScopePicker, Search, Select, Status, TextArea,
  dirname, filter, folderActions, useAction, useOpeners, useResource, useScopes, useT } from './ui.jsx';

export function CommandsPage() {
  const t = useT(), { scope, scopes } = useScopes(), opener = useOpeners(), action = useAction();
  const [search, setSearch] = useState(''), [editor, setEditor] = useState(null), [removing, setRemoving] = useState(null);
  const list = useResource(() => api(query('/commands', { scope })), [scope]);
  const data = list.data;
  const groups = useMemo(() => !data ? [] : [['project', data.project], ['user', data.user], ['builtin', data.builtin]]
    .map(([key, items]) => [key, filter(items, search, ['name', 'description'])]).filter(([, items]) => items.length), [data, search]);
  const edit = async command => {
    const file = await action.run(() => api(query('/commands/file', { scope, location: command.location, name: command.name })));
    if (file) setEditor({ previous: command.name, location: command.location, name: command.name, description: file.description === command.name ? '' : file.description,
      argumentHint: file.argumentHint, body: file.body });
  };
  const create = () => setEditor({ location: scope === 'global' ? 'user' : 'project', name: '', description: '', argumentHint: '', body: '' });
  const menu = command => [{ id: 'edit', label: t('edit'), run: () => edit(command) }, ...folderActions(t, opener, dirname(command.path), task => action.run(task)),
    { id: 'delete', label: t('delete'), run: () => setRemoving(command) }];
  const custom = (data?.user.length ?? 0) + (data?.project.length ?? 0);
  return <Page start={<><ScopePicker scope={scope} scopes={scopes}/><Search value={search} onChange={setSearch}/></>}
    end={<><RefreshButton busy={list.loading} onClick={() => list.reload()}/>
      <Button variant="primary" size="sm" icon={<IconPlusOutlineRegular size={13}/>} onClick={create}>{t('commands.new')}</Button></>}
    intro={t('commands.intro')} status={<Status error={list.error ?? action.error} notice={action.notice} onRetry={list.error ? () => list.reload() : undefined}/>}>
    {list.loading && !data ? <p className="dshx-muted">{t('loading')}</p> : <>
      {data && !custom && !search && <p className="dshx-empty">{t('commands.empty')}</p>}
      {data && search && !groups.length && <p className="dshx-empty">{t('noMatch')}</p>}
      {groups.map(([key, items]) => <Group key={key} title={t(`commands.group.${key}`)} count={items.length}
        hint={key !== 'builtin' && data.dirs[key] ? <code>{data.dirs[key]}</code> : undefined}>
        {items.map(command => key === 'builtin'
          ? <Row key={command.name} icon={<IconCodeOutlineRegular size={20}/>} title={`/${command.name}`} tags={command.hint ? <Tag tone="quiet">{command.hint}</Tag> : null} description={command.description}/>
          : <Row key={command.path} icon={<IconCodeOutlineRegular size={20}/>} title={`/${command.name}`} muted={command.conflict} onOpen={() => edit(command)}
            tags={<>{command.argumentHint && <Tag tone="quiet">{command.argumentHint}</Tag>}{command.conflict && <Tag tone="warning">{t('commands.conflict')}</Tag>}
              {command.error && <Tag tone="danger">{t('commands.fileError', { message: command.error })}</Tag>}</>}
            description={command.description} end={<ActionsMenu actions={menu(command)}/>}/>)}
      </Group>)}
    </>}
    {editor && <CommandEditor editor={editor} scope={scope} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await list.reload({ quiet: true }); }}/>}
    <Confirm open={!!removing} title={t('commands.delete.title')} description={removing ? t('commands.delete.desc', { name: removing.name, path: removing.path }) : ''} busy={action.busy} error={action.error}
      onCancel={() => { setRemoving(null); action.clear(); }}
      onConfirm={async () => { if (await action.run(() => api('/commands', { scope, action: 'delete', location: removing.location, name: removing.name }), t('deleted'))) { setRemoving(null); await list.reload({ quiet: true }); } }}/>
  </Page>;
}

function CommandEditor({ editor, scope, onClose, onSaved }) {
  const t = useT(), action = useAction(), [draft, setDraft] = useState(editor);
  const set = key => event => setDraft(current => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    const input = { action: 'save', location: draft.location, name: draft.name.trim(), previous: editor.previous, description: draft.description, argumentHint: draft.argumentHint, body: draft.body };
    if (await action.run(() => api('/commands', { scope, ...input }))) onSaved();
  };
  return <Editor open wide title={editor.previous ? t('commands.edit.title', { name: editor.previous }) : t('commands.new')} onClose={onClose} onSave={save} busy={action.busy} error={action.error}
    saveLabel={editor.previous ? undefined : t('create')}>
    {scope !== 'global' && !editor.previous && <Field label={t('location')}><Select label={t('location')} value={draft.location}
      options={[{ value: 'project', label: t('location.project') }, { value: 'user', label: t('location.user') }]} onChange={value => setDraft(current => ({ ...current, location: value }))}/></Field>}
    <div className="dshx-field-row">
      <Field label={t('commands.name')} hint={t('commands.name.hint')}><Input value={draft.name} onChange={set('name')} placeholder="review" data-modal-autofocus/></Field>
      <Field label={t('commands.argumentHint')} hint={t('commands.argumentHint.hint')}><Input value={draft.argumentHint} onChange={set('argumentHint')}/></Field>
    </div>
    <Field label={t('commands.description')}><Input value={draft.description} onChange={set('description')}/></Field>
    <Field label={t('commands.template')} hint={t('commands.template.hint')}><TextArea rows={12} value={draft.body} onChange={set('body')} placeholder={t('commands.template.placeholder')}/></Field>
  </Editor>;
}
