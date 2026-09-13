import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, mkdtemp, copyFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { nativeLock } from '../src/computer-use/native-lock.mjs';

const run = (command, args) => {
  try { return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  // Command errors contain argv; do not expose local keychain passwords.
  catch (error) { throw new Error(`${command} failed: ${String(error.stderr || 'no diagnostic').slice(-1800)}`); }
};

// Local development has a persistent signing identity in a dedicated keychain.
// No certificate is trusted system-wide and the login keychain is untouched.
// Distribution builds should provide an actual Developer ID signing identity.
export async function signNativeBundle(app) {
  const signingDirectory=join(homedir(),'Library/Application Support/trisoul-x/development-signing');
  await mkdir(signingDirectory,{recursive:true,mode:0o700});
  const lockDirectory=await mkdtemp(join(tmpdir(),'trisoul-sign-lock-'));
  let unlock;
  try {
  // codesign changes the app executable. Run the locking helper from a copy so
  // signing cannot invalidate the code signature of the live lock holder.
  const helper=join(lockDirectory,'lock');await copyFile(join(app,'Contents/MacOS/trisoul-computer-use'),helper);
  unlock=await nativeLock(helper,join(signingDirectory,'signing.lock'));
  const releaseIdentity = process.env.TRISOUL_CU_SIGN_IDENTITY;
  if (releaseIdentity) {
    run('codesign', ['--force', '--sign', releaseIdentity, '--options', 'runtime', '--timestamp', app]);
  } else {
    const directory = join(homedir(), 'Library/Application Support/trisoul-x/development-signing');
    const keychain = join(directory, 'computer-use.keychain-db'), metadata = join(directory, 'identity.json');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let identity;
    try { identity = JSON.parse(await readFile(metadata, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const temporary = await mkdtemp(join(tmpdir(), 'trisoul-signing-'));
      const password = randomBytes(32).toString('hex');
      const configuration = join(temporary, 'openssl.cnf'), key = join(temporary, 'key.pem'), certificate = join(temporary, 'certificate.pem'), archive = join(temporary, 'identity.p12');
      const oldMask = process.umask(0o077);
      try {
        await writeFile(configuration, '[req]\ndistinguished_name=subject\nx509_extensions=signing\nprompt=no\n[subject]\nCN=Trisoul Computer Use Local Development\n[signing]\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n');
        run('openssl', ['req', '-new', '-newkey', 'rsa:3072', '-nodes', '-x509', '-sha256', '-days', '3650', '-config', configuration, '-keyout', key, '-out', certificate]);
        const passwordFile = join(temporary, 'password');
        await writeFile(passwordFile, password, { mode: 0o600 });
        run('openssl', ['pkcs12', '-export', '-inkey', key, '-in', certificate, '-out', archive, '-passout', 'file:' + passwordFile]);
        const fingerprint = run('openssl', ['x509', '-in', certificate, '-noout', '-fingerprint', '-sha1']).trim().split('=').at(-1).replaceAll(':', '');
        run('security', ['create-keychain', '-p', password, keychain]);
        run('security', ['set-keychain-settings', '-l', '-u', '-t', '600', keychain]);
        run('security', ['import', archive, '-k', keychain, '-P', password, '-x', '-T', '/usr/bin/codesign']);
        run('security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain]);
        identity = { fingerprint, password };
        await writeFile(metadata, JSON.stringify(identity), { mode: 0o600, flag: 'wx' });
      } finally { process.umask(oldMask); await rm(temporary, { recursive: true, force: true }); }
    }
    run('security', ['unlock-keychain', '-p', identity.password, keychain]);
    const searchList = () => [...run('security', ['list-keychains', '-d', 'user']).matchAll(/"([^"\n]+)"/g)].map(match => match[1]);
    const before = searchList(), added = !before.includes(keychain);
    try {
      // codesign resolves the certificate in --keychain but resolves its key
      // through the search list. Add only our private chain while signing.
      if (added) run('security', ['list-keychains', '-d', 'user', '-s', ...before, keychain]);
      run('codesign', ['--force', '--sign', identity.fingerprint, '--keychain', keychain, '--timestamp=none', app]);
    } finally {
      if (added) run('security', ['list-keychains', '-d', 'user', '-s', ...searchList().filter(path => path !== keychain)]);
      run('security', ['lock-keychain', keychain]);
    }
  }
  run('codesign', ['--verify', '--strict', app]);
  } finally { await unlock?.();await rm(lockDirectory,{recursive:true,force:true}); }
}
