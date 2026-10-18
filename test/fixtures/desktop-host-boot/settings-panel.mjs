import assert from 'node:assert/strict';

// Pinned OpenCU 3908660: SettingsContent mounts CapabilitySettings and
// BrowserSettings together. ControlList uses the REA button role="switch"
// with an explicit aria-checked boolean; absent attributes never mean off.
export async function assertComputerBrowserPanel(settings) {
  const content = [];
  for (const text of ['Chrome / Edge 连接', '内置浏览器', '托管浏览器']) {
    const row = settings.getByText(text, { exact: true });
    await row.waitFor({ state: 'visible' });
    assert.equal(await row.count(), 1, 'Single visible settings content: ' + text);
    content.push(text);
  }
  const switches = [];
  for (const name of ['启用浏览器连接', '启用托管浏览器']) {
    const toggle = settings.getByRole('switch', { name, exact: true });
    await toggle.waitFor({ state: 'visible' });
    assert.equal(await toggle.count(), 1, 'Single settings switch: ' + name);
    const role = await toggle.getAttribute('role');
    const checked = await toggle.getAttribute('aria-checked');
    assert.equal(role, 'switch', 'Actual REA switch role: ' + name);
    assert.equal(checked, 'false', 'Explicitly disabled settings switch: ' + name);
    switches.push({ name, role, checked });
  }
  return { content, switches };
}
