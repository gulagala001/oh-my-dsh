import React, { useEffect, useSyncExternalStore } from 'react';
import { Button } from './native-controls.jsx';
import { Personality } from './editor.jsx';
import { API, SETTINGS_EVENT } from '../shared/protocol.mjs';

export function createSettingsClient() {
  let snapshot = { config: null, error: '' }, queue = Promise.resolve(), revision = 0, disposed = false;
  const listeners = new Set();
  const publish = value => { if (!disposed) { snapshot = { ...snapshot, ...value }; for (const listener of listeners) listener(); } };
  const request = async patch => {
    const response = await fetch(API + '/settings', patch === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '人格设置读取失败');
    return data;
  };
  return {
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    async load() {
      const ticket = ++revision;
      try { const config = await request(); if (ticket === revision) publish({ config, error: '' }); }
      catch (error) { if (ticket === revision) publish({ error: error.message }); }
    },
    commit(patch) {
      ++revision;
      const write = async () => {
        try {
          const config = await request(patch); ++revision; publish({ config, error: '' });
          if (!disposed) window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: config }));
          return true;
        } catch (error) { ++revision; publish({ error: '保存失败：' + error.message }); return false; }
      };
      queue = queue.then(write, write); return queue;
    },
    dispose() { disposed = true; ++revision; listeners.clear(); },
  };
}
export function PersonaSettings({ client }) {
  const { config, error } = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => { void client.load(); }, [client]);
  return <div className="dsp-settings">
    {error && <div className="dsp-set-status dsp-set-error" role="alert"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => void client.load()}>重新读取</Button></div>}
    {config ? <Personality config={config} commit={client.commit}/> : !error && <p role="status">正在读取人格设置…</p>}
  </div>;
}
