import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The platform grant is scoped to its issuer. Chat authenticates independently.
export async function probeDshAccount(account) {
  const grant = await account.getPlatformSession();
  if (!grant) return { status: 'signed-out' };
  if (grant.origin !== 'https://platform.deepseek.com') return { status: 'different-issuer' };
  const target = new URL('/auth-api/v0/users/current', grant.origin).href;
  const header = 'x-dsh-auth-token';
  try {
    const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { [header]: grant.token } });
    const payload = await response.json();
    const accepted = response.ok && payload.code === 0 && payload.data?.biz_code === 0 && Boolean(payload.data?.biz_data);
    return { status: 'credential-stored', platformAccepted: accepted, results: [{ target, header, accepted,
      httpStatus: response.status, code: typeof payload.code === 'number' ? payload.code : null,
      bizCode: typeof payload.data?.biz_code === 'number' ? payload.data.biz_code : null }] };
  } catch { return { status: 'probe-failed', results: [{ target, header, error: 'network-or-protocol' }] }; }
}

export async function saveAccountProbe(account, directory) {
  let result;
  try { result = await probeDshAccount(account); } catch { result = { status: 'probe-failed' }; }
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'account-probe.json'), JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2), { mode: 0o600 });
}
