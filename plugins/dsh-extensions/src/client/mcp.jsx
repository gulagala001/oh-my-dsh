import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, StateDot, Switch, Tag, IconApiOutlineRegular, IconPlusOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api, query } from './api.mjs';
import { ActionsMenu, Confirm, Detail, Editor, Facts, Field, Group, Page, RefreshButton, Row, Search, Select, Status, TextArea,
  filter, useAction, useResource, useT } from './ui.jsx';

const TONES = { connected: 'success', starting: 'info', failed: 'danger', disabled: 'quiet', invalid: 'warning' };
const DOTS = { connected: 'done', starting: 'ongoing', failed: 'error', disabled: 'idle', invalid: 'warning' };
const lines = text => text.split('\n').map(line => line.trim()).filter(Boolean);
function pairs(text, separator) {
  const out = {};
  for (const line of lines(text)) { const at = line.indexOf(separator); if (at > 0) out[line.slice(0, at).trim()] = line.slice(at + 1).trim(); }
  return out;
}
const unpairs = (value = {}, separator) => Object.entries(value).map(([key, item]) => `${key}${separator}${item}`).join('\n');

function StatusTag({ status }) {
  const t = useT();
  return <Tag tone={TONES[status] ?? 'quiet'}><span className="dshx-status"><StateDot state={DOTS[status] ?? 'idle'} size={status === 'starting' ? 12 : 8}/>{t(`mcp.status.${status}`)}</span></Tag>;
}
function reason(t, server) {
  if (!server.error) return '';
  const key = `mcp.reason.${server.error}`, text = t(key);
  return text === key ? server.error : text;
}

export function McpPage() {
  const t = useT(), action = useAction();
  const [search, setSearch] = useState(''), [open, setOpen] = useState(null), [editor, setEditor] = useState(null), [removing, setRemoving] = useState(null), [importing, setImporting] = useState(false);
  const list = useResource(() => api('/mcp'), []);
  const servers = list.data?.servers ?? [], managed = list.data?.managed ?? [];
  const connecting = servers.some(server => server.status === 'starting');
  useEffect(() => {
    if (!connecting) return;
    const timer = setInterval(() => void list.reload({ quiet: true }), 2000);
    return () => clearInterval(timer);
  }, [connecting, list.reload]);
  const write = async (input, success) => {
    const done = await action.run(() => api('/mcp', input), success);
    await list.reload({ quiet: true });
    return done;
  };
  const edit = async name => {
    const server = await action.run(() => api(query('/mcp/server', { name })));
    if (server) setEditor({ previous: name, name, raw: server.raw ?? {} });
  };
  const menu = server => [{ id: 'edit', label: t('edit'), run: () => edit(server.name) },
    server.status !== 'disabled' && server.status !== 'invalid' && { id: 'reconnect', label: t('mcp.reconnect'), run: () => write({ action: 'reconnect', name: server.name }) },
    { id: 'delete', label: t('delete'), run: () => setRemoving(server) }];
  const visible = useMemo(() => filter(servers, search, ['name', 'target']), [servers, search]);
  const current = open && servers.find(server => server.name === open);
  const dialogs = <>
    {editor && <ServerEditor editor={editor} onClose={() => setEditor(null)} onSaved={async name => { setEditor(null); await list.reload({ quiet: true }); if (open) setOpen(name); }}/>}
    {importing && <ImportEditor onClose={() => setImporting(false)} onSaved={async () => { setImporting(false); await list.reload({ quiet: true }); }}/>}
    <Confirm open={!!removing} title={t('mcp.delete.title')} description={removing ? t('mcp.delete.desc', { name: removing.name }) : ''} busy={action.busy} error={action.error}
      onCancel={() => { setRemoving(null); action.clear(); }} onConfirm={async () => { if (await write({ action: 'delete', name: removing.name }, t('deleted'))) { setRemoving(null); setOpen(null); } }}/>
  </>;
  if (current) return <>
    <Detail title={current.name} tags={<StatusTag status={current.status}/>} onBack={() => setOpen(null)}
      actions={<><Switch label={t('toggle', { name: current.name })} checked={current.status !== 'disabled'} disabled={action.busy || current.status === 'invalid'}
        onChange={value => write({ action: 'enable', name: current.name, enabled: value })}/>
        <Button variant="outline" size="sm" onClick={() => edit(current.name)}>{t('edit')}</Button><ActionsMenu actions={menu(current).slice(1)}/></>}>
      <Status error={action.error} notice={action.notice}/>
      <Facts rows={[[t('mcp.transport'), current.transport ? t(`mcp.transport.${current.transport}`) : '—'], [t('mcp.target'), <code>{current.target ?? '—'}</code>],
        current.envKeys.length > 0 && [t('mcp.env'), t('mcp.secrets', { keys: current.envKeys.join(', ') })],
        current.headerKeys.length > 0 && [t('mcp.headers'), t('mcp.secrets', { keys: current.headerKeys.join(', ') })],
        current.timeoutMs && [t('mcp.timeout'), String(current.timeoutMs / 1000)],
        current.error && [t('mcp.error'), <span className="dshx-error-text">{reason(t, current)}</span>]]}/>
      <Group title={t('mcp.toolsTitle')} count={current.tools.length}>
        {!current.tools.length ? <li className="dshx-muted">{t('mcp.noTools')}</li> : current.tools.map(tool => <Row key={tool.name} title={<code>{tool.name}</code>}
          description={tool.description} muted={!tool.enabled}
          end={<Switch label={t('mcp.toolSwitch', { name: tool.name })} checked={tool.enabled} disabled={action.busy}
            onChange={value => write({ action: 'tool', name: current.name, tool: tool.name, enabled: value })}/>}/>)}
      </Group>
    </Detail>{dialogs}</>;
  return <Page start={<Search value={search} onChange={setSearch}/>}
    end={<><RefreshButton busy={list.loading} onClick={() => list.reload()}/><Button variant="outline" size="sm" onClick={() => setImporting(true)}>{t('mcp.paste')}</Button>
      <Button variant="primary" size="sm" icon={<IconPlusOutlineRegular size={13}/>} onClick={() => setEditor({ name: '', raw: { command: '' } })}>{t('mcp.add')}</Button></>}
    intro={list.data ? t('mcp.intro', { file: list.data.file }) : null}
    status={<>{list.data?.error && <Status error={{ code: 'mcp-file', message: t('mcp.fileError', { message: list.data.error }) }}/>}
      <Status error={list.error ?? action.error} notice={action.notice} onRetry={list.error ? () => list.reload() : undefined}/></>}>
    {list.loading && !list.data ? <p className="dshx-muted">{t('loading')}</p>
      : !servers.length && !managed.length ? <p className="dshx-empty">{t('mcp.empty')}</p>
      : <>
        {servers.length > 0 && <Group title="mcp.json" count={visible.length}>
          {!visible.length ? <li className="dshx-muted">{t('noMatch')}</li> : visible.map(server => <Row key={server.name} icon={<IconApiOutlineRegular size={20}/>}
            title={server.name} tags={<StatusTag status={server.status}/>} muted={server.status === 'disabled'} onOpen={() => setOpen(server.name)}
            description={<code>{server.target ?? '—'}</code>}
            meta={server.error ? <span className="dshx-error-text">{reason(t, server)}</span> : server.status === 'connected' ? t('mcp.tools', { n: server.tools.filter(tool => tool.enabled).length }) : null}
            end={<><Switch label={t('toggle', { name: server.name })} checked={server.status !== 'disabled'} disabled={action.busy || server.status === 'invalid'}
              onChange={value => write({ action: 'enable', name: server.name, enabled: value })}/><ActionsMenu actions={menu(server)}/></>}/>)}
        </Group>}
        {managed.length > 0 && <Group title={t('mcp.managed')} count={managed.length} hint={t('mcp.managed.hint')}>
          {managed.map(row => <Row key={row.entryId ?? row.id} icon={<IconApiOutlineRegular size={20}/>} title={row.name ?? row.id} muted={!row.enabled}
            tags={<Tag tone="quiet">{row.phase}</Tag>} description={row.target ? <code>{row.target}</code> : null}
            meta={row.enabled && row.tools.length ? t('mcp.tools', { n: row.tools.length }) : null}
            end={<Switch label={t('toggle', { name: row.name ?? row.id })} checked={row.enabled} disabled={row.readOnly || !row.entryId || action.busy}
              onChange={value => write({ action: 'managed', entryId: row.entryId, enabled: value })}/>}/>)}
        </Group>}
      </>}
    {dialogs}
  </Page>;
}

function ServerEditor({ editor, onClose, onSaved }) {
  const t = useT(), action = useAction();
  const raw = editor.raw, http = raw.url !== undefined || ['http', 'streamable-http', 'sse'].includes(raw.type);
  const [draft, setDraft] = useState({ name: editor.name, transport: http ? (raw.type === 'sse' ? 'sse' : 'streamable-http') : 'stdio',
    command: raw.command ?? '', args: (raw.args ?? []).join('\n'), env: unpairs(raw.env, '='), cwd: raw.cwd ?? '',
    url: raw.url ?? '', headers: unpairs(raw.headers, ': '), timeout: raw.timeout ? String(raw.timeout / 1000) : '' });
  const set = key => event => setDraft(current => ({ ...current, [key]: event.target.value }));
  const save = async () => {
    const timeout = draft.timeout.trim() ? Math.round(Number(draft.timeout) * 1000) : undefined;
    const server = draft.transport === 'stdio'
      ? { command: draft.command.trim(), args: lines(draft.args), env: pairs(draft.env, '='), ...draft.cwd.trim() ? { cwd: draft.cwd.trim() } : {} }
      : { type: draft.transport === 'sse' ? 'sse' : 'http', url: draft.url.trim(), headers: pairs(draft.headers, ':') };
    if (timeout) server.timeout = timeout;
    const name = draft.name.trim();
    if (await action.run(() => api('/mcp', { action: 'save', name, previous: editor.previous, server }))) onSaved(name);
  };
  return <Editor open title={editor.previous ? t('mcp.edit.title', { name: editor.previous }) : t('mcp.new.title')} onClose={onClose} onSave={save} busy={action.busy} error={action.error} wide>
    <div className="dshx-field-row">
      <Field label={t('mcp.name')} hint={t('mcp.name.hint')}><Input value={draft.name} onChange={set('name')} placeholder="github" data-modal-autofocus/></Field>
      <Field label={t('mcp.transport')}><Select label={t('mcp.transport')} value={draft.transport} onChange={value => setDraft(current => ({ ...current, transport: value }))}
        options={['stdio', 'streamable-http'].map(value => ({ value, label: t(`mcp.transport.${value}`) }))}/></Field>
    </div>
    {draft.transport === 'stdio' ? <>
      <Field label={t('mcp.command')} hint={t('mcp.command.hint')}><Input value={draft.command} onChange={set('command')} placeholder="npx"/></Field>
      <Field label={t('mcp.args')} hint={t('mcp.args.hint')}><TextArea rows={4} value={draft.args} onChange={set('args')} placeholder={'-y\n@modelcontextprotocol/server-filesystem'}/></Field>
      <Field label={t('mcp.env')} hint={t('mcp.env.hint')}><TextArea rows={3} value={draft.env} onChange={set('env')} placeholder="API_KEY=…"/></Field>
      <Field label={t('mcp.cwd')} hint={t('mcp.cwd.hint')}><Input value={draft.cwd} onChange={set('cwd')}/></Field>
    </> : <>
      <Field label={t('mcp.url')}><Input value={draft.url} onChange={set('url')} placeholder="https://example.com/mcp"/></Field>
      <Field label={t('mcp.headers')} hint={t('mcp.headers.hint')}><TextArea rows={3} value={draft.headers} onChange={set('headers')} placeholder="Authorization: Bearer …"/></Field>
    </>}
    <Field label={t('mcp.timeout')} hint={t('mcp.timeout.hint')}><Input value={draft.timeout} onChange={set('timeout')} inputMode="numeric" placeholder="60"/></Field>
  </Editor>;
}

function ImportEditor({ onClose, onSaved }) {
  const t = useT(), action = useAction(), [json, setJson] = useState('');
  const save = async () => { if (await action.run(() => api('/mcp', { action: 'import', json }))) onSaved(); };
  return <Editor open title={t('mcp.import.title')} description={t('mcp.import.hint')} onClose={onClose} onSave={save} busy={action.busy} error={action.error} saveLabel={t('import')} wide>
    <TextArea rows={14} value={json} onChange={event => setJson(event.target.value)} aria-label="JSON" data-modal-autofocus
      placeholder={'{\n  "mcpServers": {\n    "filesystem": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"]\n    }\n  }\n}'}/>
  </Editor>;
}
