import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const [module, directory, log] = process.argv.slice(2);
const write = line => appendFileSync(log, line + '\n');
write('Bundled Node: ' + process.versions.node + ' / Electron ' + process.versions.electron);
for (const backend of ['browser', 'native', 'extension']) {
  let runtime;
  try {
    write('Opening ' + backend);
    const { createRuntime } = await import(pathToFileURL(module).href);
    runtime = await createRuntime({
      dataDir: join(directory, backend),
      browserEnabled: backend === 'browser',
      nativeEnabled: backend === 'native',
      extensionEnabled: backend === 'extension',
      token: randomBytes(24).toString('base64url'),
    });
    await runtime.permissions();
    write('Read ' + backend + ': ' + JSON.stringify(runtime.runtimeInfo.warnings));
  } catch (error) { write(error.name + ' ' + (error.code ?? '') + ': ' + error.message); }
  finally { if (runtime) await runtime.close(); }
}
