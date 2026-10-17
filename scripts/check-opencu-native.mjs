import {checkMacHelperDistribution as check} from '../vendor/opencu/src/native/macos-identity.mjs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

// Use the reviewed bundled verifier/pin, never code loaded from the incoming archive.
export const checkMacHelperDistribution = root => check(root);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await check(resolve(process.argv[2] || fileURLToPath(new URL('../vendor/opencu', import.meta.url))));
  console.log('OpenCU persistent macOS signing identity verified');
}
