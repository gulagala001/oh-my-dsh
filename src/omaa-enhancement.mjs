import { scopeOf } from '@deepseek-ai/dsh-scope';
import { sessionPersonality } from './personality-session.mjs';
import { PERSONALITY_SCOPE, personalityGuidance } from './cc-adaptation/texts.mjs';
import { apply as applyCodegraph } from './codegraph-agent.mjs';

// Mount these sibling rows inside OMAA's workflowEngine-isolated Group. The
// disabled native entries retain the host Loader's dependency resolver; only
// the OMD engine/tool run, using the provider already registered by OMD root.
export function omaaWorkflowComposition() {
  return [
    { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', disabled: true },
    { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow', disabled: true },
    { id: 'omd-workflow-ptc', name: 'oh-my-dsh/host/workflow-ptc', config: { provider: 'omd-workflow' } },
    { id: 'omd-tool-workflow', name: 'oh-my-dsh/host/tool-workflow' },
  ];
}

// Reuse the installed OMD runtime in the caller's preset scope. The preset
// keeps its own prompt, tools, and compaction; no OMD main-agent is mounted.
export async function installOmaaEnhancement(scope, computer) {
  const key = scopeOf(scope), before = new Set(scope.tools.schemas(key).map(tool => tool.name));
  await applyCodegraph(scope);
  const computerNames = await computer.installTools(scope);
  const names = scope.tools.schemas(key).map(tool => tool.name).filter(name => !before.has(name));
  // Return only names present in this scope's actual SDK view, including an
  // owned CodeGraph index that may shadow an already visible global tool.
  const visible = new Set(scope.tools.schemas(key).map(tool => tool.name));
  return [...new Set([...names, ...computerNames, ...(visible.has('codegraph_index') ? ['codegraph_index'] : [])])];
}

export const omaaIdentityPrompt = (hub, session) => {
  const { modules } = sessionPersonality(hub, session);
  return [modules.identity, modules.identity ? PERSONALITY_SCOPE : '',
    ...['style', 'communication', 'presentation'].map(key => personalityGuidance(key, modules[key]))].filter(Boolean).join('\n\n');
};
