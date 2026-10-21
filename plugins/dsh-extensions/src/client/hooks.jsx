import React, { useState } from 'react';
import { Button, Input, RiskConfirmation, StateDot, Switch, Tag, IconSlidersTwoOutlineRegular, IconPlusOutlineRegular, IconPlayOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api } from './api.mjs';
import { ActionsMenu, Confirm, Editor, Field, Group, Page, RefreshButton, Row, Select, Status, TextArea, errorMessage, useAction, useResource, useT } from './ui.jsx';

const DOTS = { ok: 'done', blocked: 'warning', error: 'error', timeout: 'error' };
const time = ms => new Date(ms).toLocaleTimeString();

export function HooksPage() {
  const t = useT(), action = useAction();
  const [editor, setEditor] = useState(null), [removing, setRemoving] = useState(null), [risk, setRisk] = useState(false), [acknowledged, setAcknowledged] = useState(false);
  const list = useResource(() => api('/hooks'), []);
  const data = list.data, hooks = data?.hooks ?? [];
  const write = async (input, success) => {
    const done = await action.run(() => api('/hooks', input), success);
    await list.reload({ quiet: true });
    return done;
  };
  const events = data ? [...data.events, ...new Set(hooks.map(hook => hook.event).filter(event => !data.events.includes(event)))] : [];
  const groups = events.map(event => [event, hooks.filter(hook => hook.event === event)]).filter(([, items]) => items.length);
  const blank = { event: 'PreToolUse', matcher: '', command: '', timeout: '' };
  const add = () => { if (acknowledged) setEditor(blank); else setRisk(true); };
  const edit = hook => setEditor({ id: hook.id, expected: hook.command, event: hook.event, matcher: hook.matcher, command: hook.command, timeout: hook.timeout ? String(hook.timeout) : '', enabled: hook.enabled });
  const matcherTag = hook => data.matcherEvents.includes(hook.event)
    ? <Tag tone="quiet">{hook.matcher || t(hook.event === 'SessionStart' ? 'hooks.allSources' : 'hooks.allTools')}</Tag> : null;
  return <Page
    start={data && <span className="dshx-inline-switch"><Switch label={t('hooks.all')} checked={data.enabled} disabled={action.busy || !!data.error}
      onChange={value => write({ action: 'all', enabled: value })}/><span>{t('hooks.all')}</span></span>}
    end={<><RefreshButton busy={list.loading} onClick={() => list.reload()}/>
      <Button variant="primary" size="sm" icon={<IconPlusOutlineRegular size={13}/>} disabled={!!data?.error} onClick={add}>{t('hooks.add')}</Button></>}
    intro={data ? t('hooks.intro', { file: data.file }) : null}
    status={<>{data?.error && <Status error={{ code: 'hooks-file', message: t('hooks.fileError', { message: data.error }) }}/>}
      <Status error={list.error ?? action.error} notice={action.notice} onRetry={list.error ? () => list.reload() : undefined}/></>}>
    {list.loading && !data ? <p className="dshx-muted">{t('loading')}</p> : data && <>
      {!hooks.length && <p className="dshx-empty">{t('hooks.empty')}</p>}
      {groups.map(([event, items]) => {
        const supported = data.events.includes(event);
        return <Group key={event} title={supported ? t(`hooks.event.${event}`) : event} count={items.length} hint={supported ? t(`hooks.eventHint.${event}`) : t('hooks.unsupported')}>
          {items.map(hook => <Row key={hook.id} icon={<IconSlidersTwoOutlineRegular size={20}/>} title={<code>{hook.command}</code>} muted={!hook.enabled || !data.enabled || !supported}
            tags={<>{matcherTag(hook)}{hook.timeout && <Tag tone="quiet">{hook.timeout}s</Tag>}</>} onOpen={supported ? () => edit(hook) : undefined}
            end={<><Switch label={t('toggle', { name: hook.command })} checked={hook.enabled} disabled={action.busy || !supported}
              onChange={value => write({ action: 'enable', id: hook.id, expected: hook.command, enabled: value })}/>
              <ActionsMenu actions={[supported && { id: 'edit', label: t('edit'), run: () => edit(hook) }, { id: 'delete', label: t('delete'), run: () => setRemoving(hook) }]}/></>}/>)}
        </Group>;
      })}
      <Group title={t('hooks.runs')} count={data.runs.length}>
        {!data.runs.length ? <li className="dshx-muted">{t('hooks.runs.empty')}</li> : data.runs.map((run, index) => <li key={`${run.at}-${index}`} className="dshx-run">
          <StateDot state={DOTS[run.outcome] ?? 'idle'} size={8}/>
          <span className="dshx-run-time">{time(run.at)}</span>
          <span>{data.events.includes(run.event) ? t(`hooks.event.${run.event}`) : run.event}</span>
          <code className="dshx-run-command">{run.command}</code>
          <span className="dshx-run-outcome">{t(`hooks.outcome.${run.outcome}`)}{run.code !== null && run.code !== undefined ? ` · ${run.code}` : ''} · {run.durationMs} ms</span>
          {run.detail && <span className="dshx-run-detail">{run.detail}</span>}
        </li>)}
      </Group>
    </>}
    <RiskConfirmation open={risk} title={t('hooks.risk.title')} description={t('hooks.risk.desc')} acknowledgeLabel={t('hooks.risk.ack')}
      cancelLabel={t('cancel')} closeLabel={t('close')} confirmLabel={t('hooks.risk.confirm')} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged}
      onCancel={() => { setRisk(false); setAcknowledged(false); }} onConfirm={() => { setRisk(false); setEditor(blank); }}/>
    {editor && data && <HookEditor editor={editor} data={data} onClose={() => setEditor(null)} onSaved={async () => { setEditor(null); await list.reload({ quiet: true }); }}/>}
    <Confirm open={!!removing} title={t('hooks.delete.title')} busy={action.busy} error={action.error}
      description={removing ? t('hooks.delete.desc', { event: data?.events.includes(removing.event) ? t(`hooks.event.${removing.event}`) : removing.event }) : ''}
      onCancel={() => { setRemoving(null); action.clear(); }}
      onConfirm={async () => { if (await write({ action: 'delete', id: removing.id, expected: removing.command }, t('deleted'))) setRemoving(null); }}/>
  </Page>;
}

function HookEditor({ editor, data, onClose, onSaved }) {
  const t = useT(), action = useAction(), test = useAction();
  const [draft, setDraft] = useState(editor), [result, setResult] = useState(null);
  const set = key => event => setDraft(current => ({ ...current, [key]: event.target.value }));
  const timeout = () => draft.timeout.trim() ? Number(draft.timeout) : undefined;
  const matcher = data.matcherEvents.includes(draft.event);
  const save = async () => {
    const input = { action: 'save', id: editor.id, expected: editor.expected, event: draft.event, matcher: matcher ? draft.matcher : '', command: draft.command, timeout: timeout(), enabled: editor.enabled ?? true };
    if (await action.run(() => api('/hooks', input))) onSaved();
  };
  const run = async () => {
    setResult(null);
    const response = await test.run(() => api('/hooks', { action: 'test', event: draft.event, command: draft.command, timeout: timeout() }));
    if (response) setResult(response.run);
  };
  return <Editor open wide title={editor.id ? t('hooks.edit.title') : t('hooks.new.title')} onClose={onClose} onSave={save} busy={action.busy} error={action.error}>
    <div className="dshx-field-row">
      <Field label={t('hooks.event')}><Select label={t('hooks.event')} value={draft.event} onChange={value => { setDraft(current => ({ ...current, event: value })); setResult(null); }}
        options={data.events.map(value => ({ value, label: t(`hooks.event.${value}`) }))}/></Field>
      {matcher && <Field label={t('hooks.matcher')} hint={t(draft.event === 'SessionStart' ? 'hooks.matcher.source' : 'hooks.matcher.tool')}>
        <Input value={draft.matcher} onChange={set('matcher')} placeholder={draft.event === 'SessionStart' ? 'startup|resume' : 'bash|write'}/></Field>}
    </div>
    <p className="dshx-hint">{t(`hooks.eventHint.${draft.event}`)}</p>
    <Field label={t('hooks.command')} hint={t('hooks.command.hint')}><TextArea rows={4} value={draft.command} onChange={set('command')} placeholder="~/.dsh/hooks/check.sh" data-modal-autofocus/></Field>
    <Field label={t('hooks.timeout')} hint={t('hooks.timeout.hint')}><Input value={draft.timeout} onChange={set('timeout')} inputMode="numeric" placeholder="60"/></Field>
    <div className="dshx-test">
      <Button type="button" variant="outline" size="sm" icon={<IconPlayOutlineRegular size={13}/>} disabled={test.busy || !draft.command.trim()} onClick={run}>{test.busy ? t('hooks.testing') : t('hooks.test')}</Button>
      {test.error && <span className="dshx-error-text">{errorMessage(t, test.error)}</span>}
      {result && <span className="dshx-muted">{result.timedOut ? t('hooks.test.timeout') : result.error ? result.error : t('hooks.test.result', { code: result.code, ms: result.durationMs })}
        {result.result && (result.result.block || result.result.halt || result.result.permission === 'deny') ? ` · ${t('hooks.outcome.blocked')}` : ''}</span>}
    </div>
    {result && (result.stdout || result.stderr) && <div className="dshx-test-output">
      {result.stdout && <><small>{t('hooks.stdout')}</small><pre className="dshx-code">{result.stdout}</pre></>}
      {result.stderr && <><small>{t('hooks.stderr')}</small><pre className="dshx-code">{result.stderr}</pre></>}
    </div>}
  </Editor>;
}
