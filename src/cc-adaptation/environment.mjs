// Rewrite only owned environment sections. Never filter user text, tool results,
// repository instructions, paths, callable schemas, or historical messages.
export function neutralizeHostEnvironment(assembly, { neutralBrand = true, directoryTool = true } = {}) {
  const source = assembly.contexts?.find(s => s.name === 'harness:source')?.text ?? '';
  // Runtime-owned checkout identity, never user text. Installed archives are
  // not source worktrees; unknown installations must be verified before builds.
  const packed = /\.asar(?:[\\/]|[".\s]|$)/.test(source);
  const rewrite = section => {
    let text = section.text;
    if (typeof text !== 'string') return section;
    switch (section.name) {
      case 'harness:identity':
        if (!neutralBrand) break;
        text = text.replace(/^You are an AI agent powered by DeepSeek Harness\.$/, 'You are an AI agent.');
        break;
      case 'harness:source':
        text = '## Host installation\nThe runtime context identifies the host installation separately from the working directory. Use the reported current directory; ' + (directoryTool ? 'query working_directory' : 'query it through an available tool') + ' when it is missing or may have changed. '
          + (packed ? 'This host runs from a packaged archive, not a writable source checkout. Changes require a separate source checkout and an authorized build/install workflow.'
            : 'Before changing the host itself, verify this installation is a writable source checkout with its build inputs.');
        break;
      case 'app:web-surface':
        text = packed ? '## Current interface\nThe runtime context names the current host GUI URL. Browser state is not implicit; inspect it through available browser tools. A separate development server does not update this installed GUI. Do not replace or restart the host without authorization.'
          : '## Current interface\n' + text.replace('DeepSeek Harness Web GUI', 'current web interface')
          .replace('The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__.',
            'The frontend build entry produces the shell, not a standalone application. It depends on boot data supplied by the existing host process.');
        break;
      case 'sandbox:policy':
        if (!neutralBrand) break;
        text = text
          .replace(/^Current DSH file policy: (read-only|workspace-write)\. Any available operation enforced by the DSH file sandbox\b/,
            'Current file policy: $1. Any available operation enforced by the file sandbox')
          .replace(/^Current DSH file policy: danger-full-access\. The DSH file sandbox\b/,
            'Current file policy: danger-full-access. The file sandbox')
          .replace(/^Current DSH file policy:/, 'Current file policy:');
        break;
    }
    return text === section.text ? section : { ...section, text };
  };
  const sections = assembly.sections.map(rewrite);
  const contexts = (assembly.contexts ?? []).map(s => s.name === 'sandbox:policy' ? rewrite(s) : s);
  if (sections.every((s, i) => s === assembly.sections[i])
      && contexts.every((s, i) => s === assembly.contexts?.[i])) return assembly;
  return { ...assembly, sections, contexts };
}
