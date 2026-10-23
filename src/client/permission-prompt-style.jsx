import React from 'react';
import { acquirePermissionMenu } from '../../plugins/persona/src/client/permission-menu.jsx';
import { PROMPT_STYLES } from '../prompt-styles/options.mjs';
import { Icon } from './native-icons.jsx';

const prefix = 'omd-prompt-style:';
async function request(sessionId, style, signal) {
  const response = await fetch('oh-my-dsh/api/prompt-style?session=' + encodeURIComponent(sessionId), { signal,
    ...(style === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style }) }) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '读取提示词风格失败');
  return data;
}

export class PromptStyleMenu extends React.Component {
  state = { data: null, error: '', busy: false, loading: false, visibleSetting: undefined };
  revision = 0;
  componentDidMount() {
    this.alive = true;
    window.addEventListener('omd:settings-saved', this.settingsChanged);
    if (this.props.open) void this.load();
  }
  componentDidUpdate(previous) {
    if (previous.sessionId !== this.props.sessionId) {
      this.pending = null; this.controller?.abort();
      this.setState({ data: null, error: '', busy: false });
      void this.load();
    } else if (this.props.open && !previous.open) void this.load();
  }
  componentWillUnmount() {
    this.alive = false; ++this.revision; this.pending = null; this.controller?.abort();
    window.removeEventListener('omd:settings-saved', this.settingsChanged);
  }
  settingsChanged = event => {
    // Closing the entry is immediate, even if an older session request is in flight.
    if (typeof event.detail?.sessionPromptStyleEnabled === 'boolean') this.setState({ visibleSetting: event.detail.sessionPromptStyleEnabled });
    if (this.props.open) void this.load();
  };
  load = async (preserveError = false) => {
    if (this.pending) { this.refreshPending = true; return; }
    this.refreshPending = false;
    const ticket = ++this.revision, sessionId = this.props.sessionId;
    this.controller?.abort(); const controller = this.controller = new AbortController();
    const active = () => this.alive && ticket === this.revision && sessionId === this.props.sessionId;
    this.setState({ loading: true });
    try {
      const data = await request(sessionId, undefined, controller.signal);
      if (active()) this.setState(state => ({ data, error: preserveError ? state.error : '', visibleSetting: undefined }));
    } catch (error) { if (active()) this.setState({ error: error.message }); }
    finally { if (active()) this.setState({ loading: false }); }
  };
  change = async style => {
    const { data, busy, loading, visibleSetting } = this.state;
    if (this.pending || busy || loading || visibleSetting === false || !data?.enabled || data.locked || this.props.locked || data.style === style) return;
    if (!PROMPT_STYLES.some(option => option.value === style)) return;
    const write = this.pending = {}, sessionId = this.props.sessionId; ++this.revision;
    this.controller?.abort(); const controller = this.controller = new AbortController();
    const active = () => this.alive && this.pending === write && sessionId === this.props.sessionId;
    this.setState({ busy: true, error: '' });
    try { const data = await request(sessionId, style, controller.signal); if (active()) this.setState({ data }); }
    catch (error) {
      if (active()) {
        this.setState({ error: error.message });
        try { const data = await request(sessionId, undefined, controller.signal); if (active()) this.setState({ data }); }
        catch (recovery) { if (active()) this.setState({ error: error.message + '；重新读取失败：' + recovery.message }); }
      }
    } finally {
      if (active()) { this.pending = null; this.setState({ busy: false }); if (this.refreshPending) void this.load(true); }
    }
  };
  render() {
    const { MenuComponent, sessionId, started, locked, ...menu } = this.props;
    const { data, error, busy, loading, visibleSetting } = this.state;
    const visible = visibleSetting !== false && data?.enabled;
    const items = [...(menu.items || [])];
    if (visible) {
      items.push({ type: 'separator', id: prefix + 'separator' }, { type: 'label', id: prefix + 'title', text: '系统提示词风格' });
      for (const option of PROMPT_STYLES) items.push({ id: prefix + option.value, label: option.label, disabled: Boolean(locked || data.locked || busy || loading || error) });
      if (error) items.push({ type: 'label', id: prefix + 'error', text: error },
        { id: prefix + 'retry', label: '重试读取提示词风格', icon: <Icon name="refresh" size={16}/>, disabled: busy || loading });
    }
    return <MenuComponent {...menu} sessionId={sessionId} started={started} locked={locked} items={items}
      selectedIds={[...(menu.selectedIds || []), ...(menu.selectedId ? [menu.selectedId] : []), ...(visible ? [prefix + data.style] : [])]}
      onSelect={id => { if (id === prefix + 'retry') void this.load(); else if (id.startsWith(prefix)) void this.change(id.slice(prefix.length)); else menu.onSelect?.(id); }}/>
  }
}

export function applyPromptStylePermissions(ctx) { acquirePermissionMenu(ctx, 'omd-prompt-style', PromptStyleMenu); }
