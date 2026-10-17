import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Read-only official-origin probes. Grants and response bodies never leave Host memory. */
export async function probeDshAccount(account) {
  const grant = await account.getPlatformSession();
  if (!grant) return { status: 'signed-out', chatAccepted: false };
  if (grant.origin !== 'https://platform.deepseek.com') return { status: 'different-issuer', chatAccepted: false };
  const results = [];
  for (const [target, header] of [['https://platform.deepseek.com/auth-api/v0/users/current', 'x-dsh-auth-token'],
    ['https://chat.deepseek.com/api/v0/users/current', 'x-dsh-auth-token'], ['https://chat.deepseek.com/api/v0/users/current', 'authorization']]) {
    try {
      const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(12000),
        headers: { [header]: header === 'authorization' ? `Bearer ${grant.token}` : grant.token } });
      const payload = await response.json();
      const accepted = response.ok && payload.code === 0 && payload.data?.biz_code === 0 && Boolean(payload.data?.biz_data);
      results.push({ target, header, httpStatus: response.status, code: typeof payload.code === 'number' ? payload.code : null,
        bizCode: typeof payload.data?.biz_code === 'number' ? payload.data.biz_code : null, accepted });
    } catch { results.push({ target, header, accepted: false, error: 'network-or-protocol' }); }
  }
  return { status: 'credential-stored', platformAccepted: results[0]?.accepted === true,
    chatAccepted: results.slice(1).some(row => row.accepted), results };
}

export async function saveAccountProbe(account, directory) {
  let result;
  try { result = await probeDshAccount(account); } catch { result = { status: 'probe-failed', chatAccepted: false }; }
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'account-probe.json'), JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2), { mode: 0o600 });
}
