import assert from 'node:assert/strict';
// Original I3n/SettingsRow structure in the fixed bundled client: connection
// label + ready description + manage/disconnect/revoke buttons. No transient
// pairingStatus or global "connected" text is used as the row identity.
export function assertConnectionIdentity(state,status,extensionId) {
  assert.equal(state.ok,true); assert.equal(status.connected,true); assert.equal(status.paired,true);
  assert.equal(state.connections.length,1); assert.equal(state.pairings.length,1);
  const connection=state.connections[0],pairing=state.pairings[0];
  for(const key of ['instanceId','browserInstanceId','epoch']) { assert.equal(typeof status[key],'string'); assert(status[key]); assert.equal(connection[key],status[key]); }
  assert.equal(connection.extensionId,extensionId); assert.equal(pairing.extensionId,extensionId); assert.equal(pairing.instanceId,connection.instanceId);
  assert.equal(pairing.label,connection.label); assert.equal(typeof connection.label,'string'); assert(connection.label);
  return connection;
}
export const readyText=/^(Ready\. Return to your conversation and ask AI to use a webpage in this browser\.|可以使用了。回到对话，让 AI 操作这个浏览器中的网页。)$/;
export const manageText=/^(Connection settings|连接设置)$/;
export function assertConnectionView(view,label) {
  assert.equal(view.rows.length,1); const row=view.rows[0];
  assert.equal(row.label,label); assert(readyText.test(row.ready)); assert.equal(row.manage,1); assert.equal(row.disconnect,1); assert.equal(row.revoke,1);
  assert.equal(view.count,1); return true;
}
export async function readConnectionView(page,label) {
  const rows=page.locator('[class~="@container/settings-row"]').filter({has:page.getByText(label,{exact:true})}).filter({has:page.getByRole('button',{name:manageText})});
  const projected=[];
  for(let index=0;index<await rows.count();index++) {
    const row=rows.nth(index);
    projected.push({label:await row.getByText(label,{exact:true}).innerText(),ready:await row.getByText(readyText).innerText(),manage:await row.getByRole('button',{name:manageText}).count(),disconnect:await row.getByRole('button',{name:/^(Disconnect|断开连接)$/}).count(),revoke:await row.getByRole('button',{name:/^(Revoke pairing|撤销配对)$/}).count()});
  }
  // ConnectionStatus is an ordinary span, separate from the per-profile row.
  const count=await page.locator('span.min-w-0.truncate').filter({hasText:/^(1 browser connections|已连接 1 个浏览器)$/}).count();
  return {rows:projected,count};
}
