/** Derive Pro from the approved Ultracode reference, retaining shared wording.
 * Exact anchors fail visibly on source drift instead of silently restoring a
 * verification pattern or maintaining a second copy of the common tool API.
 */
export function proWorkflowGuide(source) {
  let text = source;
  const replace = (before, after) => {
    if (text.split(before).length !== 2) throw new Error('Pro workflow reference anchor changed: ' + before.slice(0,100));
    text = text.replace(before, after);
  };
  const replaceSection = (start, end, after) => {
    const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
    if (a < 0 || b < 0 || text.indexOf(start, a + start.length) !== -1) throw new Error('Pro workflow reference section changed: ' + start);
    text = text.slice(0, a) + after + text.slice(b);
  };
  replace('to be confident (independent perspectives and adversarial checks before committing), or ', '');
  replace('(migrations, audits, broad sweeps)', '(migrations, broad sweeps)');
  replace('what fans out, what verifies, what synthesizes.', 'what fans out, what implements, what synthesizes.');
  replace('- **Design** — judge panel of N independent approaches → scored synthesis', '- **Design** — N independent approaches → compare and synthesize');
  replace('- **Review** — dimensions → find → adversarially verify (the review-changes example)\n', '');
  replace('- **Migrate** — discover sites → transform each (worktree isolation) → verify', '- **Migrate** — discover sites → transform each (worktree isolation) → integrate');
  replace('Subagents carry out the assigned work through completion, including implementation and relevant checks.', 'Subagents carry out the assigned work through completion, including implementation and iterative refinement.');
  replace('(understand → design → implement → review)', '(understand → design → implement → refine)');
  replace('(adversarial verify, multi-modal sweep, completeness critic, loop-until-dry)', '(candidate comparison, multi-modal sweep, iterative refinement)');
  replace('Lean toward orchestrating implementation with workflows and adversarially verifying findings that materially affect correctness — unless the work is trivial or already verified.', "Lean toward orchestrating implementation with workflows and refining the result to satisfy the user's request — unless the work is trivial or already complete.");

  // Keep the same metadata example and API shape, using implementation work.
  replace("name: 'find-flaky-tests'", "name: 'implement-modules'");
  replace("description: 'Find flaky tests and propose fixes'", "description: 'Implement the requested modules'");
  replace("{ title: 'Scan', detail: 'grep test logs for retries' }", "{ title: 'Read', detail: 'read the module interfaces' }");
  replace("{ title: 'Fix', detail: 'one agent per flaky test' }", "{ title: 'Build', detail: 'one agent per independent module' }");
  replace("phase('Scan')\n  const flaky = await agent('grep CI logs for retry markers', {schema: FLAKY_SCHEMA})", "phase('Read')\n  const interfaces = await agent('Read the interfaces of the requested modules.')");
  replace('the hardest verify/judge stages', 'the hardest implementation stages');
  replace('("0 bugs found → skip verification entirely")', '("0 remaining modules → skip implementation entirely")');
  replace('Stage N\'s prompt references "the other findings" for comparison', 'Stage N\'s prompt references "the other implementations" for comparison');

  replaceSection('When a barrier IS correct — dedup across all findings before expensive verification:', 'Quality patterns — common shapes; pick by task and compose freely:', `When a barrier IS correct — merge requirements before assigning overlapping implementation work:
  const all = await parallel(args.map(requirement => () => agent(requirement, {schema: MODULES_SCHEMA})))
  const modules = dedupeByPath(all.filter(Boolean).flatMap(r => r.modules))
  const implemented = await parallel(modules.map(m => () => agent(implementationPrompt(m))))

Loop-through-requirements pattern — carry the requested work through completion:
  const parts = []
  while (parts.length < args.length) {
    const result = await agent(args[parts.length])
    if (result === null) { log("A requirement did not complete; inspect its result before continuing."); break }
    parts.push(result)
    log(\`\${parts.length}/\${args.length} requirements processed\`)
  }
  return parts

Loop-until-budget pattern — scale depth to the user's "+500k" directive. Guard on budget.total: with no target set, remaining() is Infinity and the loop would run straight to the 1000-agent cap.
  const improvements = []
  while (budget.total && budget.remaining() > 50_000) {
    const result = await agent("Complete or refine the requested deliverable, addressing concrete gaps in the current implementation.", {schema: IMPROVEMENT_SCHEMA})
    if (result === null) { log("The implementation step failed; inspect its result before continuing."); break }
    improvements.push(result)
    log(\`\${improvements.length} improvements, \${Math.round(budget.remaining()/1000)}k remaining\`)
    if (result.complete) break
  }

`);
  replaceSection('- Adversarial verify:', '- Multi-modal sweep:', `- Candidate comparison: generate N independent attempts from different angles (e.g. MVP-first, risk-first, user-first), compare the results, synthesize from the winner while grafting the best ideas from runners-up. Beats one-attempt-iterated when the solution space is wide.
- Iterative refinement: carry concrete requirements through implementation, integrate the results, and refine the work to address remaining gaps in the user's request.
`);
  replace('- Completeness critic: a final agent that asks "what\'s missing — modality not run, claim unverified, source unread?" What it finds becomes the next round of work.\n', '');
  replace('Scale to what the user asked for. "find any bugs" → a few finders, single-vote verify. "thoroughly audit this" or "be comprehensive" → larger finder pool, 3–5 vote adversarial pass, synthesis stage. When unsure, lean toward thoroughness for research/review/audit requests and toward brevity for quick checks.', 'Scale to what the user asked for. When unsure, lean toward thoroughness for research requests and toward brevity for quick checks.');
  return text.replaceAll('Ultracode', 'Pro').replaceAll('ultracode', 'pro');
}
