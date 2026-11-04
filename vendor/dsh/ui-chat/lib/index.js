import z from "@deepseek-ai/schemastery";
//#region lib/types/index.js
var CHAT_SETTINGS_NAMESPACE = "ui-chat";
var TRANSCRIPT_VIEW_FIELD = "transcriptView";
var COLLAPSE_TIMING_FIELD = "collapseTiming";
var COLLAPSE_TIMINGS = ["completion", "next-input"];
var DEFAULT_COLLAPSE_TIMING = "completion";
var FOLDED_REPLIES_FIELD = "foldedReplies";
var FOLDED_REPLIES = ["all", "final"];
var DEFAULT_FOLDED_REPLIES = "all";
var TRANSCRIPT_VIEW_MODES = [
	"compact",
	"standard",
	"detailed",
	"verbose"
];
var LEGACY_TRANSCRIPT_VIEW_MODE = "normal";
var LEGACY_EXPANDED_TRANSCRIPT_VIEW_MODE = "expanded";
var TRANSCRIPT_VIEW_SETTING_VALUES = [
	...TRANSCRIPT_VIEW_MODES,
	LEGACY_TRANSCRIPT_VIEW_MODE,
	LEGACY_EXPANDED_TRANSCRIPT_VIEW_MODE
];
var DEFAULT_TRANSCRIPT_VIEW_MODE = "detailed";
var PERFORMANCE_USAGE_MODES = ["compact", "detailed"];
var DEFAULT_PERFORMANCE_USAGE = "detailed";
var DEFAULT_LINK_OPENING = "sidebar";
var ChatSettingsFields = {
	[COLLAPSE_TIMING_FIELD]: z.union([...COLLAPSE_TIMINGS]).default(DEFAULT_COLLAPSE_TIMING),
	[FOLDED_REPLIES_FIELD]: z.union([...FOLDED_REPLIES]).default(DEFAULT_FOLDED_REPLIES),
	linkOpening: z.union(["sidebar", "new-tab"]).default(DEFAULT_LINK_OPENING),
	performanceUsage: z.union([...PERFORMANCE_USAGE_MODES]).default(DEFAULT_PERFORMANCE_USAGE),
	[TRANSCRIPT_VIEW_FIELD]: z.union([...TRANSCRIPT_VIEW_SETTING_VALUES]).loose()
};
z.object(ChatSettingsFields);
var Config = z.object({
	[TRANSCRIPT_VIEW_FIELD]: ChatSettingsFields[TRANSCRIPT_VIEW_FIELD].volatile(),
	collapseTiming: ChatSettingsFields.collapseTiming.volatile(),
	foldedReplies: ChatSettingsFields.foldedReplies.volatile(),
	performanceUsage: ChatSettingsFields["performanceUsage"].volatile(),
	linkOpening: ChatSettingsFields.linkOpening.volatile()
});
function apply(ctx) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
}
//#endregion
export { CHAT_SETTINGS_NAMESPACE, Config, DEFAULT_TRANSCRIPT_VIEW_MODE, LEGACY_EXPANDED_TRANSCRIPT_VIEW_MODE, LEGACY_TRANSCRIPT_VIEW_MODE, TRANSCRIPT_VIEW_FIELD, TRANSCRIPT_VIEW_MODES, apply };
