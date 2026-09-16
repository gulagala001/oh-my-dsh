// Rewrite only owned environment sections. Never filter user text, tool results,
// repository instructions, paths, callable schemas, or historical messages.
export function neutralizeHostEnvironment(assembly) {
  const rewrite = section => {
    let text = section.text;
    if (typeof text !== 'string') return section;
    switch (section.name) {
      case 'harness:identity':
        text = text.replace(/^You are an AI agent powered by DeepSeek Harness\.$/, 'You are an AI agent.');
        break;
      case 'harness:source':
        text = text.replace(/^The DeepSeek Harness implementation checkout/, 'The host application source checkout')
          .replace(/Use this checkout only to inspect or extend DSH itself\.$/, 'Use this checkout only to inspect or extend the host application itself.');
        break;
      case 'app:web-surface':
        text = text.replace('DeepSeek Harness Web GUI', 'current web interface')
          .replace('The apps/web Vite entry builds the shell but is not a standalone application because only dsh web injects window.__DSH_BOOT__.',
            'The frontend build entry produces the shell, not a standalone application. It depends on boot data supplied by the existing host process.');
        break;
      case 'sandbox:policy':
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
  const contexts = assembly.contexts.map(rewrite);
  if (sections.every((s, i) => s === assembly.sections[i])
      && contexts.every((s, i) => s === assembly.contexts[i])) return assembly;
  return { ...assembly, sections, contexts };
}
