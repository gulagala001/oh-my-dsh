import React, { useState } from 'react';
import { Button, Tag, IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api, query } from './api.mjs';
import { ActionsMenu, Confirm, Detail, Editor, Facts, Group, Page, RefreshButton, Row, ScopePicker, Status, TextArea,
  dirname, folderActions, formatSize, useAction, useOpeners, useResource, useScopes, useT } from './ui.jsx';

const basename = path => path.split(/[\\/]/).pop();
const when = ms => ms ? new Date(ms).toLocaleString() : '';

export function InstructionsPage() {
  const t = useT(), { scope, scopes } = useScopes(), opener = useOpeners(), action = useAction();
  const [open, setOpen] = useState(null), [editor, setEditor] = useState(null), [removing, setRemoving] = useState(null);
  const list = useResource(() => api(query('/instructions', { scope })), [scope]);
  const files = list.data?.files ?? [];
  const current = open && files.find(file => file.path === open);
  const edit = async file => {
    const loaded = await action.run(() => api(query('/instructions/file', { scope, path: file.path })));
    if (loaded) setEditor({ path: file.path, name: file.display, exists: file.exists, content: loaded.content });
  };
  const menu = file => [{ id: 'edit', label: file.exists ? t('edit') : t('instructions.create'), disabled: file.tooLarge, run: () => edit(file) },
    ...file.exists ? folderActions(t, opener, dirname(file.path), task => action.run(task)) : [],
    file.exists && { id: 'delete', label: t('delete'), run: () => setRemoving(file) }];
  const tags = file => <>{!file.exists && <Tag tone="quiet">{t('instructions.missing')}</Tag>}{file.local && <Tag tone="quiet">{t('instructions.local')}</Tag>}
    {file.tooLarge && <Tag tone="warning">{t('instructions.tooLarge')}</Tag>}</>;
  const dialogs = <>
    {editor && <InstructionEditor editor={editor} scope={scope} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await list.reload({ quiet: true }); }}/>}
    <Confirm open={!!removing} title={t('instructions.delete.title')} description={removing ? t('instructions.delete.desc', { path: removing.path }) : ''} busy={action.busy} error={action.error}
      onCancel={() => { setRemoving(null); action.clear(); }}
      onConfirm={async () => { if (await action.run(() => api('/instructions', { scope, action: 'delete', path: removing.path }), t('deleted'))) { setRemoving(null); setOpen(null); await list.reload({ quiet: true }); } }}/>
  </>;
  if (current) return <>
    <Detail title={current.display} tags={tags(current)} onBack={() => setOpen(null)}
      actions={<>{!current.tooLarge && <Button variant="outline" size="sm" onClick={() => edit(current)}>{current.exists ? t('edit') : t('instructions.create')}</Button>}
        <ActionsMenu actions={menu(current).slice(1)}/></>}>
      <Status error={action.error} notice={action.notice}/>
      <Facts rows={[[t('path'), <code>{current.path}</code>], current.exists && [t('instructions.size'), `${formatSize(current.size)} · ${when(current.modifiedAt)}`]]}/>
      {current.exists && !current.tooLarge && <InstructionContent scope={scope} path={current.path} snapshot={list.data}/>}
    </Detail>{dialogs}</>;
  const groups = [['user', files.filter(file => file.group === 'user')], ['project', files.filter(file => file.group === 'project')]].filter(([, items]) => items.length);
  return <Page start={<ScopePicker scope={scope} scopes={scopes}/>} end={<RefreshButton busy={list.loading} onClick={() => list.reload()}/>}
    intro={t('instructions.intro')} status={<Status error={list.error ?? action.error} notice={action.notice} onRetry={list.error ? () => list.reload() : undefined}/>}>
    {list.loading && !list.data ? <p className="dshx-muted">{t('loading')}</p> : <>
      {groups.map(([key, items]) => <Group key={key} title={t(`instructions.group.${key}`)} count={items.filter(file => file.exists).length}
        hint={key === 'project' && list.data.projectRoot ? <code>{list.data.projectRoot}</code> : undefined}>
        {items.map(file => <Row key={file.path} icon={<IconListPenOutlineRegular size={20}/>} title={file.display} tags={tags(file)} muted={!file.exists}
          onOpen={() => setOpen(file.path)} description={file.exists ? `${formatSize(file.size)} · ${when(file.modifiedAt)}` : t('instructions.createHint', { name: basename(file.path) })}
          end={<>{!file.exists && file.creatable && <Button variant="outline" size="sm" onClick={() => edit(file)}>{t('instructions.create')}</Button>}<ActionsMenu actions={file.exists ? menu(file) : []}/></>}/>)}
      </Group>)}
      {scope === 'global' && scopes.length > 0 && <p className="dshx-hint">{t('instructions.pick')}</p>}
    </>}
    {dialogs}
  </Page>;
}

function InstructionContent({ scope, path, snapshot }) {
  const t = useT();
  const file = useResource(() => api(query('/instructions/file', { scope, path })), [scope, path, snapshot]);
  if (file.error) return <Status error={file.error}/>;
  return <section className="dshx-section"><h3 className="dshx-group-title">{t('content')}</h3><pre className="dshx-code">{file.data ? file.data.content || ' ' : t('loading')}</pre></section>;
}

function InstructionEditor({ editor, scope, onClose, onSaved }) {
  const t = useT(), action = useAction(), [content, setContent] = useState(editor.content);
  const save = async () => { if (await action.run(() => api('/instructions', { scope, action: 'save', path: editor.path, content }))) onSaved(); };
  return <Editor open wide title={t(editor.exists ? 'instructions.edit.title' : 'instructions.create.title', { name: editor.name })} description={editor.path}
    onClose={onClose} onSave={save} busy={action.busy} error={action.error} saveLabel={editor.exists ? undefined : t('create')}>
    <TextArea rows={22} value={content} onChange={event => setContent(event.target.value)} aria-label={editor.name} placeholder={t('instructions.placeholder')} data-modal-autofocus/>
  </Editor>;
}
