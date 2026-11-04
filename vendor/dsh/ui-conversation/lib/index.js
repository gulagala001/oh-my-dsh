import z from "@deepseek-ai/schemastery";
//#region lib/types/index.js
var CONVERSATION_SETTINGS_NAMESPACE = "ui-conversation";
var BUSY_ENTER_FIELD = "busyEnter";
var BUSY_ENTER_BEHAVIORS = ["queue", "steer"];
var DEFAULT_BUSY_ENTER_BEHAVIOR = "queue";
var ConversationSettingsFields = { [BUSY_ENTER_FIELD]: z.union([...BUSY_ENTER_BEHAVIORS]).default(DEFAULT_BUSY_ENTER_BEHAVIOR) };
z.object(ConversationSettingsFields);
var Config = z.object({ [BUSY_ENTER_FIELD]: ConversationSettingsFields[BUSY_ENTER_FIELD].volatile() });
function apply(ctx) {
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
}
//#endregion
export { BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE, Config, DEFAULT_BUSY_ENTER_BEHAVIOR, apply };
