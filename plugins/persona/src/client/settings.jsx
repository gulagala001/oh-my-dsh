import React, { useEffect, useSyncExternalStore } from 'react';
import { Button } from './native-controls.jsx';
import { Personality } from './editor.jsx';
export { createSettingsClient } from './settings-client.mjs';
export function PersonaSettings({ client }) {
  const { config, error } = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => { void client.load(); }, [client]);
  return <div className="dsp-settings">
    {error && <div className="dsp-set-status dsp-set-error" role="alert"><span>{error}</span><Button size="sm" variant="ghost" onClick={() => void client.load()}>重新读取</Button></div>}
    {config ? <Personality config={config} commit={client.commit}/> : !error && <p role="status">正在读取人格设置…</p>}
  </div>;
}
