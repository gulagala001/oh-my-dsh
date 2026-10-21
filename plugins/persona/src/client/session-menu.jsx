import React from 'react';
import { IconRefreshOutlineRegular, IconPersonalizationOutlineRegular, IconWorkspaceTreeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { API, SETTINGS_EVENT } from '../shared/protocol.mjs';
const prefix = 'dsh-persona:';
async function request(sessionId, preset, signal) {
  const response = await fetch(API + '/session?session=' + encodeURIComponent(sessionId), { signal,
    ...(preset === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preset }) }) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '会话人设读取失败');
  return data;
}
export class SessionMenu extends React.Component {
  state = { data: null, error: '', loading: false, busy: false };
  revision = 0;
  componentDidMount() { this.alive = true; window.addEventListener(SETTINGS_EVENT, this.settingsChanged); if (this.props.open) void this.load(); }
  componentDidUpdate(previous) {
    if (previous.sessionId !== this.props.sessionId) { this.pending = null; this.request?.abort(); this.setState({ data: null, error: '', busy: false }); void this.load(); }
    else if (this.props.open && !previous.open) void this.load();
  }
  componentWillUnmount() { this.alive = false; this.revision++; this.request?.abort(); this.pending = null; window.removeEventListener(SETTINGS_EVENT, this.settingsChanged); }
  settingsChanged = () => { if (this.props.open) void this.load(); };
  load = async (preserveError = false) => {
    if (this.pending) { this.refreshPending = true; return; }
    this.refreshPending = false;
    const ticket = ++this.revision, sessionId = this.props.sessionId;
    this.request?.abort(); const controller = this.request = new AbortController();
    const active = () => this.alive && ticket === this.revision && sessionId === this.props.sessionId;
    this.setState({ loading: true });
    try { const data = await request(sessionId, undefined, controller.signal); if (active()) this.setState(state => ({ data, error: preserveError ? state.error : '' })); }
    catch (error) { if (active()) this.setState({ data: null, error: error.message }); }
    finally { if (active()) this.setState({ loading: false }); }
  };
  change = async preset => {
    const { data, busy, loading } = this.state;
    if (this.pending || busy || loading || !data?.enabled || data.locked || this.props.locked || data.preset === preset && !data.missing || !data.options.some(option => option.value === preset)) return;
    const write = this.pending = {}, sessionId = this.props.sessionId; ++this.revision;
    this.request?.abort(); const controller = this.request = new AbortController();
    const active = () => this.alive && this.pending === write && sessionId === this.props.sessionId;
    this.setState({ busy: true, error: '' });
    try { const data = await request(sessionId, preset, controller.signal); if (active()) this.setState({ data }); }
    catch (error) {
      if (active()) {
        this.setState({ error: error.message });
        try { const data = await request(sessionId, undefined, controller.signal); if (active()) this.setState({ data }); }
        catch (recovery) { if (active()) this.setState({ data: null, error: error.message + '；重新读取失败：' + recovery.message }); }
      }
    } finally { if (active()) { this.pending = null; this.setState({ busy: false }); if (this.refreshPending) void this.load(true); } }
  };
  render() {
    const { MenuComponent, sessionId, started, locked, ...menu } = this.props;
    const { data, error, busy, loading } = this.state;
    const items = [...(menu.items || [])];
    if (data?.enabled || !data && error) {
      items.push({ type: 'separator', id: prefix + 'separator' }, { type: 'label', id: prefix + 'title', text: '会话人设' });
      if (data?.enabled) {
        items.push({ type: 'label', id: prefix + 'current', text: (data.missing ? '所选人设已删除，当前使用：' : '当前：') + data.effectiveName + ' · 下次请求生效' });
        for (const option of data.options) items.push({ id: prefix + option.value, label: option.label,
          icon: option.value === 'inherit' ? <IconWorkspaceTreeOutlineRegular size={16}/> : <IconPersonalizationOutlineRegular size={16}/>, disabled: Boolean(locked || data.locked || busy || loading) });
      }
      if (error) items.push({ type: 'label', id: prefix + 'error', text: error }, { id: prefix + 'retry', label: '重试读取会话人设', icon: <IconRefreshOutlineRegular size={16}/>, disabled: busy || loading });
    }
    return <MenuComponent {...menu} sessionId={sessionId} started={started} locked={locked} items={items}
      selectedIds={[...(menu.selectedIds || []), ...(menu.selectedId ? [menu.selectedId] : []), ...(data?.enabled ? [prefix + data.preset] : [])]}
      onSelect={id => { if (id === prefix + 'retry') void this.load(); else if (id.startsWith(prefix)) void this.change(id.slice(prefix.length)); else menu.onSelect?.(id); }}/>
  }
}
