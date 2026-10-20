import React, { createContext, useContext } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { createPermissionPicker } from '../../lib/host/permission-native.factory.mjs';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { useMainConversation } from './main-conversation.mjs';
import { Icon } from './native-icons.jsx';

const PermissionSelect = createPermissionPicker(require);
const ScopeContext = createContext(null);
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
    const { sessionId, started, locked, ...menu } = this.props;
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
    return <Menu {...menu} items={items}
      selectedIds={[...(menu.selectedIds || []), ...(data ? [prefix + data.scope] : [])]}
      onSelect={id => {
        if (id === prefix + 'retry') void this.load();
        else if (scopes.some(([scope]) => id === prefix + scope)) void this.change(id.slice(prefix.length));
        else menu.onSelect?.(id);
      }}/>;
  }
}

function ScopeMenu(props) {
  const scope = useContext(ScopeContext);
  return <ScopeMenuControl key={scope.sessionId} {...props} {...scope}/>;
}

export function applyMemoryPermissions(ctx) {
  const name = 'conversation.input.permission';
  ctx.slots.inject(name, () => decorateSlotComponent(ctx.slots, name,
    (_key, entry) => entry.component.name === 'PermissionSelect' && entry.locale === 'permission.access' && typeof entry.inject === 'function',
    original => {
      const Original = original.component;
      return function MemoryPermissions(props) {
        const main = useMainConversation(props);
        const started = props.useSessions(s => s.byId[props.sessionId]?.blank === false);
        return main ? <ScopeContext.Provider value={{ sessionId: props.sessionId, started, locked: props.locked }}>
          <PermissionSelect key={props.sessionId} {...props} MenuComponent={ScopeMenu}/>
        </ScopeContext.Provider> : <Original {...props}/>;
      };
    }));
}
