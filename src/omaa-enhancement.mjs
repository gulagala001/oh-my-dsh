import { personalityText } from './cc-adaptation/personality.mjs';
import { apply as applyCodegraph } from './codegraph-agent.mjs';
import { registerComputerTools } from '#opencu/src/computer-use/tools.mjs';

// Mount these sibling rows inside OMAA's workflowEngine-isolated Group. The
// disabled native entries retain the host Loader's dependency resolver; only
// the OMD engine/tool run, using the provider already registered by OMD root.
export function omaaWorkflowComposition() {
  return [
    { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', disabled: true },
    { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow', disabled: true },
    { id: 'omd-workflow-ptc', name: 'trisoul_x/host/workflow-ptc', config: { provider: 'omd-workflow' } },
    { id: 'omd-tool-workflow', name: 'trisoul_x/host/tool-workflow' },
  ];
}

// Reuse the installed OMD runtime in the caller's preset scope. The preset
// keeps its own prompt, tools, and compaction; no OMD main-agent is mounted.
export async function installOmaaEnhancement(scope, computer) {
  const before = new Set(scope.tools.schemas().map(tool => tool.name));
  registerComputerTools(scope, computer);
  await applyCodegraph(scope);
  const names = scope.tools.schemas().map(tool => tool.name).filter(name => !before.has(name));
  // CodeGraph's catalog can appear later; the two prefixes stay owned by OMD.
  return [...new Set([...names, 'codegraph_index', 'computer_use', 'computer_use_reset'])];
}

export const omaaIdentityPrompt = hub => personalityText(hub.config());
