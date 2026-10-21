import React from 'react';
import { acquirePermissionMenu } from '../../plugins/persona/src/client/permission-menu.jsx';
import { Icon } from './native-icons.jsx';

const scopes = [['session', '会话隔离', 'lock'], ['project', '项目共享', 'layers'], ['global', '全局记忆', 'globe']];
const prefix = 'omd-memory:';
const api = async (sessionId, scope) => {
  const response = await fetch('trisoul-x/api/scope?session=' + encodeURIComponent(sessionId), scope === undefined ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }) });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '读取记忆范围失败');
  return data;
};

class ScopeMenuControl extends React.Component {
  state = { data: null, error: '', busy: false, loading: false };
  revision = 0;
  componentDidMount() { this.alive = true; if (this.props.open) void this.load(); }
  componentDidUpdate(prev) {
    if (this.props.open && (!prev.open || prev.started !== this.props.started)) void this.load();
  }
  componentWillUnmount() { this.alive = false; ++this.revision; this.writing = null; }
  load = async () => {
    if (this.writing) return;
    const ticket = ++this.revision;
    const active = () => this.alive && ticket === this.revision;
    this.setState({ loading: true });
    try { const data = await api(this.props.sessionId); if (active()) this.setState({ data, error: '' }); }
    catch (error) { if (active()) this.setState({ data: null, error: error.message }); }
    finally { if (active()) this.setState({ loading: false }); }
  };
  change = async scope => {
    const { data, loading } = this.state;
    if (this.writing || loading || !data || data.locked || this.props.started || this.props.locked || data.scope === scope) return;
    const write = {}; this.writing = write; ++this.revision;
    const active = () => this.alive && this.writing === write;
    this.setState({ busy: true, error: '' });
    try { const next = await api(this.props.sessionId, scope); if (active()) this.setState({ data: next }); }
    catch (error) {
      if (active()) {
        this.setState({ error: error.message });
        // A send can lock the scope while this write is pending. Read its
        // authoritative value without hiding the rejected write.
        try { const next = await api(this.props.sessionId); if (active()) this.setState({ data: next }); }
        catch (recovery) { if (active()) this.setState({ data: null, error: error.message + '；重新读取失败：' + recovery.message }); }
      }
    } finally { if (active()) { this.writing = null; this.setState({ busy: false }); } }
  };
  render() {
    const { MenuComponent, sessionId, started, locked, ...menu } = this.props;
    const { data, error, busy, loading } = this.state;
    const fixed = started || data?.locked;
    const items = [...(menu.items || []), { type: 'separator', id: prefix + 'separator' },
      { type: 'label', id: prefix + 'title', text: fixed ? '记忆范围 · 已固定' : '记忆范围' }];
    if (data) {
      for (const [scope, label, icon] of scopes) {
        if (fixed && scope !== data.scope) continue;
        items.push({ id: prefix + scope, label, icon: <Icon name={icon} size={16}/>, disabled: Boolean(fixed || locked || busy || loading) });
      }
    } else items.push({ type: 'label', id: prefix + 'loading', text: error ? '记忆范围暂不可读' : '正在读取记忆范围…' });
    if (error) {
      items.push({ type: 'label', id: prefix + 'error', text: error },
        { id: prefix + 'retry', label: '重试读取记忆范围', icon: <Icon name="refresh" size={16}/>, disabled: busy || loading });
    }
    return <MenuComponent {...menu} sessionId={sessionId} started={started} locked={locked} items={items}
      selectedIds={[...(menu.selectedIds || []), ...(menu.selectedId ? [menu.selectedId] : []), ...(data ? [prefix + data.scope] : [])]}
      onSelect={id => {
        if (id === prefix + 'retry') void this.load();
        else if (scopes.some(([scope]) => id === prefix + scope)) void this.change(id.slice(prefix.length));
        else menu.onSelect?.(id);
      }}/>;
  }
}

export function applyMemoryPermissions(ctx) { acquirePermissionMenu(ctx, 'omd-memory', ScopeMenuControl); }
