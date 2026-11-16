import { createUserMessage } from '@deepseek-ai/dsh-llm';

// Rare troubleshooting advice belongs to the failing operation, not every
// model request. Preserve both canonical values and error identities.
export function shellDiagnostic(result, name) {
  const value = result.value;
  if (!result.isError && !(typeof value?.exitCode === 'number' && value.exitCode !== 0)) return '';
  const text = [result.error?.message, value?.stdout?.text, value?.stderr?.text,
    ...(result.content ?? []).filter(b => b.type === 'text').map(b => b.text)].filter(Boolean).join('\n').slice(0, 48000);
  if (/different Team IDs|code signature.*(?:invalid|not valid)|library validation|mapped file has no Team ID/i.test(text)) return 'A native-addon signature or Team-ID failure concerns the runtime loading it. Inspect that runtime and use a verified compatible runtime; reinstalling identical bytes does not repair it. Do not disable signing or operating-system protections.';
  if (/invalid (?:npm )?package name|invalid project name|name can no longer contain capital letters|name can only contain URL-friendly characters/i.test(text)) return 'For scaffolding, provide a valid package name explicitly while keeping the user’s directory name. Follow the package manager’s build-script approval policy.';
  if (/ConstrainedLanguage|method invocation is supported only on core types|Cannot create type.*only core types/i.test(text)) return 'In constrained PowerShell, use supported cmdlets and core types. Do not widen permissions or change the language mode to bypass the restriction.';
  if (name === 'pwsh' && /EPERM/.test(text) && /pipe|stdio/i.test(text)) return 'A subprocess pipe-capture denial does not imply PowerShell pipelines are unavailable. Use a documented supported stdio mode only when the task permits; do not widen the operation’s access.';
  return '';
}

export function installShellDiagnostics(ctx) {
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    if (!['bash', 'pwsh'].includes(exec.name) || exec.signal?.aborted || decision.kind !== 'accept') return decision;
    const hint = shellDiagnostic(result, exec.name);
    return hint ? { ...decision, additionalContexts: [...(decision.additionalContexts ?? []), createUserMessage({
      content: [{ type: 'text', text: '<shell-diagnostic>\n' + hint + '\n</shell-diagnostic>' }],
      source: { kind: 'plugin:oh-my-dsh:shell-diagnostic' },
    })] } : decision;
  });
}
