import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// These files are opened by native processes outside Electron's ASAR filesystem.
const shared = ['vendor/opencu/extension', 'vendor/unharnessed/python', 'vendor/unharnessed/vendor'];
const mac = ['vendor/opencu/native/macos', 'vendor/opencu/lib/cursor.html'];
const windows = ['vendor/opencu/native/windows'];
const directories = [...shared, mac[0], ...windows, 'vendor/opencu/native/bin'];
export const omdUnpackPatterns = [
  ...directories.map(path => '**/node_modules/oh-my-dsh/' + path + '/**/*'),
  '**/node_modules/oh-my-dsh/vendor/opencu/lib/cursor.html',
];

export async function verifyOmdResources(resources, dsh, platform, arch) {
  const plugin = 'node_modules/oh-my-dsh';
  const source = join(dsh, plugin);
  const destination = join(resources, 'app.asar.unpacked', 'dsh', plugin);
  const paths = [...shared, ...(platform === 'darwin' ? [...mac, `vendor/opencu/native/bin/darwin-${arch}/OpenCU Helper.app`] : windows)];
  async function verify(path) {
    const info = await stat(join(source, path));
    if (info.isDirectory()) {
      for (const name of await readdir(join(source, path))) await verify(join(path, name));
    } else {
      const installed = await readFile(join(destination, path));
      if (!installed.equals(await readFile(join(source, path)))) throw new Error('Desktop resource differs from its package: ' + path);
    }
  }
  for (const path of paths) await verify(path);
}
