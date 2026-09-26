import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { WindowsNativeHost, windowsBridgeActive } from '../src/computer-use/windows-native.mjs';

const binary = process.argv[2];
if (!binary || !windowsBridgeActive()) throw new Error('请在 WSL 中运行：node scripts/check-wsl-desktop.mjs /mnt/c/DSH-WinDesktop/OhMyDsh.Desktop.exe');
const directory = await mkdtemp(join(tmpdir(), 'opencu-wsl-check-'));
const host = new WindowsNativeHost(directory, { binary: resolve(binary) });
try {
  const installed = await host.installedInfo();
  const permissions = await host.permissions('ui-permissions');
  if (!permissions.interactive || !permissions.capture_supported) throw new Error('Windows 桌面未就绪：' + JSON.stringify(permissions));
  const apps = await host.list('ui-permissions');
  console.log(JSON.stringify({ platform: host.platform, bridge: host.bridge, build: installed?.build, permissions, applicationCount: apps.length }, null, 2));
} finally {
  try { await host.close(); } finally { await rm(directory, { recursive: true, force: true }); }
}
