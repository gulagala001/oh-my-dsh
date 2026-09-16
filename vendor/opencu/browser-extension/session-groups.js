// Native tab-strip groups are presentation, not debugger/input ownership.
// Only explicit controllers (never read-only preview actors) assign a session.
const STORAGE = 'omdSessionTabGroupsV1';
const COLORS = ['blue', 'purple', 'cyan', 'green', 'orange', 'pink', 'red', 'yellow', 'grey'];
const missing = error => /No (tab|group)|not found|Invalid (tab|group)/i.test(error.message);
export function conversationInfo(value) {
  if (!value || typeof value.id !== 'string' || !value.id || value.id.length > 256 || typeof value.title !== 'string') throw new Error('Invalid tab-group conversation');
  const title = value.title.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/g, ' ').replace(/\s+/g, ' ').trim();
  return { id: value.id, title: [...(title || value.id.replace(/^session-/, '').slice(0, 8))].slice(0, 64).join('') };
}
export class SessionTabGroups {
  constructor(api, controls, report = () => {}) {
    this.api = api; this.controls = controls; this.report = report;
    this.groups = new Map(); this.members = new Map();
    // Chrome group/tab IDs survive a worker suspension but not a browser restart.
    this.queue = this.restore().catch(report);
  }
  enqueue(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }
  async save() {
    await this.api.storage.session.set({ [STORAGE]: { groups: [...this.groups], members: [...this.members] } });
  }
  async restore() {
    const stored = (await this.api.storage.session.get(STORAGE))[STORAGE];
    for (const [key, group] of stored?.groups ?? []) {
      try {
        const live = await this.api.tabGroups.get(group.id);
        // Never identify a group by its displayed name or take over another group.
        if (live.windowId === group.windowId && live.title === group.displayTitle) this.groups.set(key, group);
      } catch (error) { if (!missing(error)) throw error; }
    }
    for (const [tabId, member] of stored?.members ?? []) {
      const group = this.groups.get(member.key); if (!group) continue;
      try { if ((await this.api.tabs.get(tabId)).groupId === group.id) this.members.set(tabId, member); }
      catch (error) { if (!missing(error)) throw error; }
    }
    // A restarted worker has no live leases. Retain handoff tabs, not a stale
    // "controlling" label, until the host explicitly binds a new controller.
    for (const key of this.groups.keys()) await this.render(key);
    await this.save();
  }
  active(control, actorId) {
    return this.controls.get(control.tabId) === control && !control.stopped && !control.stoppedActors.has(actorId);
  }
  color(conversationId) {
    const existing = [...this.groups.values()].find(group => group.conversationId === conversationId);
    if (existing) return existing.color;
    let hash = 0; for (const char of conversationId) hash = (Math.imul(hash, 31) + char.codePointAt(0)) >>> 0;
    const used = new Set([...this.groups.values()].map(group => group.color));
    for (let i = 0; i < COLORS.length; i++) { const color = COLORS[(hash + i) % COLORS.length]; if (!used.has(color)) return color; }
    return COLORS[hash % COLORS.length];
  }
  async render(key) {
    const group = this.groups.get(key); if (!group) return;
    const active = [...this.members].some(([tabId, member]) => {
      const control = this.controls.get(tabId);
      return member.key === key && control && !control.stopped && [...(control.groupActors ?? [])].some(([actorId, info]) => info.id === group.conversationId && this.active(control, actorId));
    });
    const title = 'OMD · ' + group.title + (active ? '' : '（已停止）');
    try { await this.api.tabGroups.update(group.id, { title, color: group.color }); group.displayTitle = title; }
    catch (error) { if (!missing(error)) throw error; this.removeGroup(group.id); }
  }
  removeGroup(groupId) {
    for (const [key, group] of this.groups) if (group.id === groupId) {
      this.groups.delete(key);
      for (const [tabId, member] of this.members) if (member.key === key) this.members.delete(tabId);
    }
  }
  async assign(tabId, info, stillCurrent) {
    if (!stillCurrent()) return { grouped: false };
    const tab = await this.api.tabs.get(tabId);
    if (!stillCurrent()) return { grouped: false };
    // Do not silently unpin a user's tab just for a visual indicator.
    if (tab.pinned) {
      const previous = this.members.get(tabId); this.members.delete(tabId);
      if (previous) { await this.render(previous.key); await this.save(); }
      throw new Error('固定标签页无法加入会话分组；取消固定后会自动分组。');
    }
    const key = JSON.stringify([info.id, tab.windowId]), previous = this.members.get(tabId);
    let group = this.groups.get(key);
    if (group) {
      try { if ((await this.api.tabGroups.get(group.id)).windowId !== tab.windowId) group = undefined; }
      catch (error) { if (!missing(error)) throw error; this.removeGroup(group.id); group = undefined; }
    }
    if (!stillCurrent()) return { grouped: false };
    if (!group) {
      const color = this.color(info.id);
      const id = await this.api.tabs.group({ tabIds: [tabId], createProperties: { windowId: tab.windowId } });
      group = { id, windowId: tab.windowId, conversationId: info.id, title: info.title, color };
      this.groups.set(key, group);
      await this.api.tabGroups.update(id, { collapsed: false });
    } else if (tab.groupId !== group.id) await this.api.tabs.group({ tabIds: [tabId], groupId: group.id });
    group.title = info.title;
    this.members.set(tabId, { key });
    if (previous && previous.key !== key) await this.render(previous.key);
    await this.render(key); await this.save();
    return { grouped: true, groupId: group.id, title: group.displayTitle, color: group.color };
  }
  claim(control, actorId, value) {
    const info = conversationInfo(value);
    return this.enqueue(async () => {
      if (!this.active(control, actorId)) return { grouped: false };
      control.groupActors ??= new Map(); control.groupActors.set(actorId, info);
      return this.assign(control.tabId, info, () => this.active(control, actorId));
    });
  }
  release(control, actorId) {
    if (actorId === undefined) control.groupActors?.clear(); else control.groupActors?.delete(actorId);
    return this.enqueue(async () => { await this.render(this.members.get(control.tabId)?.key); await this.save(); });
  }
  rename(value) {
    const info = conversationInfo(value);
    return this.enqueue(async () => {
      for (const control of this.controls.values()) for (const [actor, current] of control.groupActors ?? []) if (current.id === info.id) control.groupActors.set(actor, info);
      for (const [key, group] of this.groups) if (group.conversationId === info.id) { group.title = info.title; await this.render(key); }
      await this.save(); return { updated: true };
    });
  }
  inherit(tab) {
    return this.enqueue(async () => {
      // onCreated can arrive before Chrome publishes openerTabId. Read the
      // new tab once instead of guessing ownership from URL or active window.
      let live;
      try { live = await this.api.tabs.get(tab.id); }
      catch (error) { if (missing(error)) return; throw error; }
      const opener = this.controls.get(live.openerTabId);
      const actor = [...(opener?.groupActors ?? [])].find(([id]) => this.active(opener, id));
      if (!actor || live.url?.startsWith('chrome-extension://')) return;
      return this.assign(tab.id, actor[1], () => this.active(opener, actor[0]) && !this.controls.has(tab.id));
    });
  }
  moved(tabId) {
    const control = this.controls.get(tabId);
    const actor = [...(control?.groupActors ?? [])].find(([id]) => this.active(control, id));
    if (!actor) return Promise.resolve();
    return this.claim(control, actor[0], actor[1]);
  }
  removed(tabId) {
    return this.enqueue(async () => {
      const member = this.members.get(tabId); this.members.delete(tabId);
      await this.render(member?.key); await this.save();
    });
  }
}
