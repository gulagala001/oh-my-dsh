import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// OMD prepares and unregisters its extension through the real component API.
export async function extensionFixture(t, { profile, extensionPath }) {
  const manifest = JSON.parse(await readFile(join(extensionPath, 'manifest.json'), 'utf8'));
  const id = createHash('sha256').update(Buffer.from(manifest.key, 'base64')).digest('hex').slice(0, 32).split('').map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
  const origin = 'chrome-extension://' + id + '/';
  const context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
    args: ['--site-per-process', '--use-mock-keychain', '--password-store=basic', '--disable-extensions-except=' + extensionPath, '--load-extension=' + extensionPath] });
  t.after(() => context.close());
  context.on('dialog', () => {});
  const popup = await context.newPage(); await popup.goto(origin + 'popup.html');
  await popup.getByText('已连接 Oh My DSH', { exact: true }).waitFor({ timeout: 10000 });
  const worker = context.serviceWorkers().find(worker => worker.url() === origin + 'worker.js');
  const instanceId = await worker.evaluate(async () => (await chrome.storage.local.get('instanceId')).instanceId);
  return { context, browser: { id: 'chrome:' + instanceId } };
}
