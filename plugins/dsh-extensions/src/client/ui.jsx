import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Input, Menu, Modal, Tooltip, IconSearchOutlineRegular, IconEllipsisOutlineRegular, IconChevronLeftOutlineMedium,
  IconChevronDownOutlineRegular, IconRefreshOutlineRegular, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { api, openers, openIn } from './api.mjs';

export const Env = createContext(null);
export const cx = (...parts) => parts.filter(Boolean).join(' ');

/** Re-render on locale switches; text resolves through the host locale service. */
export function useT() {
  const env = useContext(Env);
  useSyncExternalStore(env.subscribe, env.revision);
  return env.t;
}
export function errorMessage(t, error) {
  if (!error) return '';
  const key = `error.${error.code}`, text = t(key, error.params ?? {});
  return text === key ? error.message || String(error) : text;
}

// One workspace choice shared by the Skill, instruction and command pages.
const SCOPE_KEY = 'dsh-extensions.scope';
const scopeListeners = new Set();
let scopeValue = (() => { try { return localStorage.getItem(SCOPE_KEY) || 'global'; } catch { return 'global'; } })();
export function setScope(value) {
  scopeValue = value;
  try { localStorage.setItem(SCOPE_KEY, value); } catch {}
  for (const listener of scopeListeners) listener();
}
const subscribeScope = listener => { scopeListeners.add(listener); return () => scopeListeners.delete(listener); };
export function useScopes() {
  const scope = useSyncExternalStore(subscribeScope, () => scopeValue);
  const [scopes, setScopes] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    api('/state', undefined, controller.signal).then(state => setScopes(state.scopes), () => setScopes([]));
    return () => controller.abort();
  }, []);
  const known = scope === 'global' || !scopes || scopes.some(item => item.id === scope);
  return { scope: known ? scope : 'global', scopes: scopes ?? [], ready: scopes !== null };
}

/** Load-on-mount with explicit reload; a stale response never replaces a newer one. */
export function useResource(load, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const ticket = useRef(0);
  const reload = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++ticket.current;
    if (!quiet) setState(current => ({ ...current, loading: true }));
    try { const data = await load(); if (ticket.current === mine) setState({ data, error: null, loading: false }); return data; }
    catch (error) { if (ticket.current === mine) setState(current => ({ data: quiet ? current.data : null, error, loading: false })); }
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { ...state, reload };
}

/** Run one write at a time and keep its failure visible next to the controls. */
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [notice, setNotice] = useState('');
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = useCallback(async (task, success) => {
    setBusy(true); setError(null);
    try {
      const value = await task();
      if (success) { setNotice(success); clearTimeout(timer.current); timer.current = setTimeout(() => setNotice(''), 2400); }
      return value ?? true;
    } catch (failure) { setError(failure); return false; }
    finally { setBusy(false); }
  }, []);
  return { busy, error, notice, run, clear: () => setError(null) };
}

export function Select({ value, options, onChange, disabled, label, className, id: given }) {
  const [open, setOpen] = useState(false), generated = useId(), id = given ?? generated;
  const items = [];
  let group;
  options.forEach((option, index) => {
    if (option.group !== group) { group = option.group; if (group) items.push({ type: 'label', id: `group-${index}`, text: group }); }
    items.push({ id: `option-${index}`, label: option.label, disabled: !!option.disabled, option });
  });
  const selected = items.find(item => item.option && item.option.value === value);
  return <span className={cx('dshx-select', className)}>
    <Menu open={open} onClose={() => setOpen(false)} items={items} selectedId={selected?.id} portal align="start"
      onSelect={next => { const item = items.find(entry => entry.id === next); setOpen(false); if (item?.option && item.option.value !== value) onChange(item.option.value); }}
      anchor={<Button id={id} type="button" variant="outline" size="sm" disabled={disabled} aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(current => !current)}><span className="dshx-select-value">{selected?.label ?? ''}</span><IconChevronDownOutlineRegular/></Button>}/>
  </span>;
}

export function ScopePicker({ scope, scopes }) {
  const t = useT();
  return <Select label={t('scope.label')} value={scope} onChange={setScope}
    options={[{ value: 'global', label: t('scope.global') }, ...scopes.map(item => ({ value: item.id, label: item.title, group: t('scope.workspaces') }))]}/>;
}

export function Search({ value, onChange }) {
  const t = useT();
  return <Input className="dshx-search" type="search" icon={<IconSearchOutlineRegular/>} aria-label={t('search')} placeholder={t('search')} value={value} onChange={event => onChange(event.target.value)}/>;
}

export function Page({ start, end, intro, status, children }) {
  return <section className="dshx-page">
    <div className="dshx-toolbar"><div className="dshx-toolbar-start">{start}</div><div className="dshx-toolbar-end">{end}</div></div>
    {intro && <p className="dshx-intro">{intro}</p>}
    {status}
    {children}
  </section>;
}

export function RefreshButton({ onClick, busy }) {
  const t = useT();
  return <Tooltip label={t('refresh')} side="bottom" delayMs={500} portal>
    <Button variant="ghost" size="sm" className="dshx-icon-button" aria-label={t('refresh')} aria-busy={busy} disabled={busy} onClick={onClick}><IconRefreshOutlineRegular/></Button>
  </Tooltip>;
}

export function Status({ error, notice, onRetry }) {
  const t = useT();
  if (error) return <div className="dshx-failure" role="alert"><IconWarningOutlineRegular/><span>{errorMessage(t, error)}</span>{onRetry && <Button variant="outline" size="sm" onClick={onRetry}>{t('retry')}</Button>}</div>;
  if (notice) return <p className="dshx-notice" role="status">{notice}</p>;
  return null;
}

export function Group({ title, count, hint, action, children }) {
  return <section className="dshx-group">
    <div className="dshx-group-head"><h3 className="dshx-group-title">{title}{count !== undefined && <span className="dshx-count">{count}</span>}</h3>{action}</div>
    {hint && <p className="dshx-hint">{hint}</p>}
    <ul className="dshx-rows">{children}</ul>
  </section>;
}

/** The Plugin Manager row: artwork box, title with tags, one-line description, trailing controls. */
export function Row({ icon, title, tags, description, meta, onOpen, end, muted }) {
  return <li className={cx('dshx-row', onOpen && 'dshx-row-link', muted && 'dshx-row-muted')}>
    <span className="dshx-row-icon" aria-hidden="true">{icon}</span>
    <div className="dshx-row-main">
      <div className="dshx-row-title">{onOpen ? <button type="button" className="dshx-row-open" onClick={onOpen}>{title}</button> : <span>{title}</span>}{tags}</div>
      {description && <div className="dshx-row-desc">{description}</div>}
      {meta && <div className="dshx-row-meta">{meta}</div>}
    </div>
    {end && <div className="dshx-row-end">{end}</div>}
  </li>;
}

export function ActionsMenu({ actions }) {
  const t = useT(), [open, setOpen] = useState(false);
  const items = actions.filter(Boolean).map(action => action.type === 'separator' ? action : { id: action.id, label: action.label, disabled: action.disabled });
  if (!items.length) return null;
  return <Menu open={open} onClose={() => setOpen(false)} items={items} portal align="end"
    onSelect={id => { setOpen(false); actions.find(action => action?.id === id)?.run(); }}
    anchor={<Button variant="ghost" size="sm" className="dshx-icon-button" aria-label={t('more')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(current => !current)}><IconEllipsisOutlineRegular/></Button>}/>;
}

export function Detail({ title, tags, actions, onBack, children }) {
  const t = useT();
  return <section className="dshx-page">
    <header className="dshx-detail-head">
      <Button size="sm" className="dshx-back" aria-label={t('back')} onClick={onBack}><IconChevronLeftOutlineMedium size={20} aria-hidden="true"/></Button>
      <h2 className="dshx-detail-title">{title}</h2>{tags}
      <div className="dshx-detail-actions">{actions}</div>
    </header>
    {children}
  </section>;
}

export function Facts({ rows }) {
  return <dl className="dshx-facts">{rows.filter(Boolean).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

export function Field({ label, hint, children, error }) {
  const id = useId();
  return <div className="dshx-field">
    <label htmlFor={id}>{label}</label>
    {React.cloneElement(children, { id, 'aria-invalid': error ? true : undefined })}
    {hint && <small>{hint}</small>}
  </div>;
}
export const TextArea = React.forwardRef(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cx('dshx-textarea', className)} spellCheck={false} {...props}/>;
});

export function Editor({ open, title, description, onClose, onSave, busy, error, saveLabel, children, wide }) {
  const t = useT();
  return <Modal open={open} onClose={() => { if (!busy) onClose(); }} closeLabel={t('close')} title={title} description={description}
    className={cx('dshx-modal', wide && 'dshx-modal-wide')}
    footer={<><Button variant="outline" disabled={busy} onClick={onClose}>{t('cancel')}</Button><Button variant="primary" disabled={busy} onClick={onSave}>{busy ? t('saving') : saveLabel ?? t('save')}</Button></>}>
    <form className="dshx-form" onSubmit={event => { event.preventDefault(); onSave(); }}>
      {children}
      {error && <p className="dshx-form-error" role="alert">{errorMessage(t, error)}</p>}
    </form>
  </Modal>;
}

export function Confirm({ open, title, description, confirmLabel, onCancel, onConfirm, busy, error }) {
  const t = useT();
  return <Modal open={open} onClose={() => { if (!busy) onCancel(); }} closeLabel={t('close')} title={title} description={description} className="dshx-modal"
    footer={<><Button variant="outline" disabled={busy} onClick={onCancel}>{t('cancel')}</Button><Button variant="outline" className="dshx-danger" disabled={busy} onClick={onConfirm}>{confirmLabel ?? t('delete')}</Button></>}>
    {error && <p className="dshx-form-error" role="alert">{errorMessage(t, error)}</p>}
  </Modal>;
}

/** Open a folder through DSH's own open-in-app routes when the host offers them. */
export function useOpeners() {
  const [value, setValue] = useState({ files: null, editor: null, editorName: '' });
  useEffect(() => { let alive = true; void openers().then(next => { if (alive) setValue(next); }); return () => { alive = false; }; }, []);
  return value;
}
export function folderActions(t, opener, directory, run) {
  if (!directory) return [];
  return [opener.files && { id: 'open-folder', label: t('openFolder'), run: () => run(() => openIn(opener.files, directory)) },
    opener.editor && { id: 'open-editor', label: t('openWith', { app: opener.editorName }), run: () => run(() => openIn(opener.editor, directory)) }];
}

export const dirname = path => path.replace(/[\\/][^\\/]*$/, '') || path;
export const filter = (items, text, fields) => {
  const needle = text.trim().toLowerCase();
  return needle ? items.filter(item => fields.some(field => String(item[field] ?? '').toLowerCase().includes(needle))) : items;
};
export function formatSize(bytes) { return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }
