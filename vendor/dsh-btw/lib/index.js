import z from "@deepseek-ai/schemastery";

/**
 * Codex-style `/btw` for DeepSeek Harness.
 *
 * `/btw <question>` runs the question in a sub-context seeded with the main
 * conversation (the fork provider), so the side question is answered "with
 * context" but the answer is returned as a plain command result: it is
 * rendered in the conversation UI and never enters the main session's model
 * history. The main context is not polluted.
 *
 * The command is registered through {@link "@deepseek-ai/dsh-commands"} and the
 * sub-context is delegated through {@link "@deepseek-ai/dsh-subagent"}, both
 * part of the shipped `@deepseek-ai/dsh-base` composition.
 *
 * @module dsh-btw-plugin
 */
const name = "dsh-btw-plugin";
const inject = ["commands", "subagents"];

/**
 * Plugin config.
 * - `provider`: subagent provider used for the side question. Defaults to
 *   `fork`, whose children are seeded with the parent's completed turns, i.e.
 *   they see the main conversation context. Set to `spawn` for a fully
 *   standalone question with no inherited context.
 * - `maxDepth`: optional recursion-depth cap for the child; defaults to the
 *   provider-managed harness default when omitted.
 */
const Config = z.object({
	provider: z.string().default("fork"),
	maxDepth: z.natural().max(Number.MAX_SAFE_INTEGER).default(void 0)
});

const USAGE = "Usage: /btw <question>";

/** Concise human error for an empty invocation. */
function usageError() {
	return {
		kind: "error",
		text: [
			"Ask a side question answered in a separate sub-context; the answer is shown here and never enters the main conversation context.",
			"",
			USAGE
		].join("\n")
	};
}

/** Map a child's terminal stop reason to a human error, or `undefined` when completed. */
function stopReasonError(result) {
	switch (result.stopReason) {
		case "completed": return void 0;
		case "aborted": return "The /btw sub-context was cancelled.";
		case "max-tokens": return "The /btw sub-context hit its token limit before answering.";
		case "refusal": return "The /btw sub-context declined to answer.";
		case "error": return "The /btw sub-context failed.";
		/* v8 ignore next 2 -- merge-extensible stop reasons are surfaced generically */
		default: return `The /btw sub-context ended abnormally (${result.stopReason}).`;
	}
}

/** Flatten the child's text output blocks into one string. */
function outputText(result) {
	return result.output
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

/** Run one `/btw` invocation to a settled command result. */
async function runBtw(ctx, invocation, config) {
	const question = invocation.rawInput.trim();
	if (question.length === 0) return usageError();

	if (ctx.subagents.getProvider(config.provider) === void 0) {
		return {
			kind: "error",
			text: `No subagent provider "${config.provider}" is registered. /btw needs the "${config.provider}" provider — load the matching @deepseek-ai/dsh-subagent-* provider plugin or set \`provider\` in the /btw plugin config.`
		};
	}

	const prompt = [
		{
			type: "text",
			text: [
				"You are answering a side question (\"by the way\") from the main conversation.",
				"The conversation history above is your context — use it to answer the question.",
				"",
				`Question: ${question}`,
				"",
				"Answer directly and concisely, in the same language as the question. Do not restate the conversation or ask for clarification — just answer."
			].join("\n")
		}
	];

	let run;
	try {
		run = await ctx.subagents.start(config.provider, {
			label: "btw",
			prompt,
			parent: invocation.agent,
			signal: invocation.signal,
			...config.maxDepth !== void 0 ? { maxDepth: config.maxDepth } : {}
		});
	} catch (error) {
		return {
			kind: "error",
			text: `Could not start the /btw sub-context: ${error instanceof Error ? error.message : String(error)}`
		};
	}

	let result;
	try {
		result = await run.result;
	} catch (error) {
		await run.dispose().catch(() => {});
		return {
			kind: "error",
			text: `The /btw sub-context failed: ${error instanceof Error ? error.message : String(error)}`
		};
	}
	try {
		await run.dispose();
	} catch {
		// The result is already captured; a disposal failure must not discard it.
	}

	const failure = stopReasonError(result);
	if (failure !== void 0) {
		const partial = outputText(result);
		return {
			kind: "error",
			text: partial.length === 0 ? failure : `${failure}\n\nPartial answer before the run ended:\n${partial}`
		};
	}

	const answer = outputText(result);
	if (answer.length === 0) return {
		kind: "error",
		text: "The /btw sub-context returned an empty answer."
	};
	return {
		kind: "success",
		text: answer
	};
}

/**
 * Register `/btw` for every composed human-command adapter.
 * @param ctx - context carrying the command registry and the subagent seam.
 * @param config - validated plugin config.
 */
function apply(ctx, config) {
	ctx.effect(function* () {
		yield ctx.commands.register({
			name: "btw",
			description: "Ask a side question in a sub-context; the answer stays out of the main context",
			input: { hint: "<question>" },
			handler: (invocation) => runBtw(ctx, invocation, config)
		});
	}, "dsh-btw-plugin lifecycle");
}

export { apply, inject, name, Config };
