// dsh-experimental-client-ui-agent-team 0.2.1-rc.2; upstream SHA-256 5740a0ab636520ee318e052146fa64cb5019f7fb98cda4344fd1266521b99cdb
export function createTeamOverview(require) { let record; const window = {__ModuleLoader__: {load(value) { record=value; }}};
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-agent-team",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/experimental/client-ui-agent-team/src/client/TeamAction.module.css.mjs
		const css = ".VoX2oq_root{position:relative}.VoX2oq_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:3px 7px;font-size:12px;display:inline-flex}.VoX2oq_trigger:hover,.VoX2oq_trigger:focus-visible{color:var(--dsw-alias-label-primary)}@container (width<=480px){.VoX2oq_triggerLabel{display:none}}.VoX2oq_count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px}.VoX2oq_panel{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);z-index:100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(500px,100vw - 32px);max-height:min(680px,100vh - 32px);box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:12px;flex-direction:column;padding:8px 2px 0;display:flex;position:fixed;overflow:hidden}.VoX2oq_panel:before{content:\"\";z-index:-1;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border-radius:12px;position:absolute;inset:0}.VoX2oq_panelCompact{width:min(320px,100vw - 32px)}.VoX2oq_panelCompact .VoX2oq_roster{grid-template-columns:minmax(0,1fr)}.VoX2oq_body{--dsh-scrollbar-track-margin:8px;scrollbar-gutter:stable;flex:auto;min-height:0;padding:0 9px 16px 14px;overflow-y:auto}.VoX2oq_taskTitle{align-items:center;gap:8px;display:flex}.VoX2oq_taskTitle strong{font-size:13px;font-weight:500}.VoX2oq_panel h3{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:16px 0 8px 4px;font-size:13px;font-weight:500;display:flex}.VoX2oq_body section:first-of-type h3{margin-top:8px}.VoX2oq_roster{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;display:grid}.VoX2oq_member{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);min-width:0;box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;border:0;border-radius:8px;align-items:flex-start;gap:8px;padding:10px 12px;display:flex}.VoX2oq_member:disabled{cursor:default}.VoX2oq_memberCurrent{--dsw-elevation-stroke-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);box-shadow:var(--dsw-elevation-stroke), inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent)}.VoX2oq_member:not(:disabled):hover,.VoX2oq_member:not(:disabled):focus-visible{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);box-shadow:var(--dsw-elevation-panel)}.VoX2oq_memberDot{flex:none;align-items:center;height:1lh;display:inline-flex}.VoX2oq_inactiveIcon{color:var(--dsw-alias-label-tertiary)}.VoX2oq_memberText{flex-direction:column;min-width:0;display:flex}.VoX2oq_memberName{align-items:center;gap:5px;min-width:0;display:inline-flex}.VoX2oq_memberNameText,.VoX2oq_memberText small{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.VoX2oq_memberModel{display:none}.VoX2oq_member:hover .VoX2oq_memberModel,.VoX2oq_member:focus-visible .VoX2oq_memberModel{display:inline}.VoX2oq_currentTag{text-overflow:ellipsis;flex:0 999 auto;min-width:0;padding:0 4px;font-size:10px;line-height:15px;display:inline-block;overflow:hidden}.VoX2oq_memberText small,.VoX2oq_meta{color:var(--dsw-alias-label-tertiary);font-size:11px}.VoX2oq_diagnostic,.VoX2oq_error,.VoX2oq_warning{color:var(--dsw-alias-state-error-primary)}.VoX2oq_tasks{flex-direction:column;gap:7px;display:flex}.VoX2oq_emptyNotice{color:var(--dsw-alias-label-tertiary);margin:16px 0 0 4px;font-size:12px}.VoX2oq_task{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:11px 13px}.VoX2oq_taskState{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;margin-left:auto;font-size:11px;display:inline-flex}.VoX2oq_task p{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;margin:5px 0;font-size:12px;line-height:18px}.VoX2oq_clampedDescription{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.VoX2oq_expandToggle{float:right;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:2px;margin-left:10px;padding:0;font-size:11px;line-height:20px;display:inline-flex}.VoX2oq_expandToggle:hover,.VoX2oq_expandToggle:focus-visible{color:var(--dsw-alias-label-primary)}.VoX2oq_expandToggle svg{transition:transform .12s}.VoX2oq_expandToggleOpen{transform:rotate(180deg)}.VoX2oq_meta{line-height:20px}.VoX2oq_meta>span{margin-right:10px}.VoX2oq_notice,.VoX2oq_error{align-items:center;gap:6px;padding:9px;font-size:12px;display:flex}";
		const tagId = "trisoul_x/overview/dsh-experimental-client-ui-agent-team/TeamAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "trisoul_x";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TeamAction_module_css_default = {
			"body": "VoX2oq_body",
			"clampedDescription": "VoX2oq_clampedDescription",
			"count": "VoX2oq_count",
			"currentTag": "VoX2oq_currentTag",
			"diagnostic": "VoX2oq_diagnostic",
			"emptyNotice": "VoX2oq_emptyNotice",
			"error": "VoX2oq_error",
			"expandToggle": "VoX2oq_expandToggle",
			"expandToggleOpen": "VoX2oq_expandToggleOpen",
			"inactiveIcon": "VoX2oq_inactiveIcon",
			"member": "VoX2oq_member",
			"memberCurrent": "VoX2oq_memberCurrent",
			"memberDot": "VoX2oq_memberDot",
			"memberModel": "VoX2oq_memberModel",
			"memberName": "VoX2oq_memberName",
			"memberNameText": "VoX2oq_memberNameText",
			"memberText": "VoX2oq_memberText",
			"meta": "VoX2oq_meta",
			"notice": "VoX2oq_notice",
			"panel": "VoX2oq_panel",
			"panelCompact": "VoX2oq_panelCompact",
			"root": "VoX2oq_root",
			"roster": "VoX2oq_roster",
			"task": "VoX2oq_task",
			"taskState": "VoX2oq_taskState",
			"taskTitle": "VoX2oq_taskTitle",
			"tasks": "VoX2oq_tasks",
			"trigger": "VoX2oq_trigger",
			"triggerLabel": "VoX2oq_triggerLabel",
			"warning": "VoX2oq_warning"
		};
		//#endregion
		//#region lib/types/client/TeamAction.js
		function statusKey(status) {
			switch (status) {
				case "pending": return "status.pending";
				case "in_progress": return "status.in_progress";
				case "completed": return "status.completed";
				/* v8 ignore next -- Team views omit deleted task tombstones. */
				case "deleted": return "status.completed";
			}
		}
		function memberStatusKey(status) {
			switch (status) {
				case "running": return "memberStatus.running";
				case "inactive": return "memberStatus.inactive";
				case "provisioning": return "memberStatus.provisioning";
				case "failed": return "memberStatus.failed";
			}
		}
		function memberDotState(status) {
			switch (status) {
				case "running":
				case "provisioning": return "ongoing";
				case "failed": return "error";
			}
		}
		function taskDotState(task) {
			switch (task.status) {
				case "pending": return task.ready ? "idle" : "warning";
				case "in_progress": return "ongoing";
				case "completed": return "done";
				/* v8 ignore next -- Team views omit deleted task tombstones. */
				case "deleted": return "idle";
			}
		}
		function TeamMemberRow({ member, memberCount, sessionId, useSessions, useSessionStatus, openTeammate, onError, renderAvatar, t }) {
			const model = useSessions((state) => state.projectionsBySession[member.id]?.values.modelSelection?.next?.model);
			const running = useSessionStatus((state) => state.get(member.id)?.running);
			const summaryRunning = useSessions((state) => state.byId[member.id]?.running);
			const status = member.phase === "active" ? (running ?? summaryRunning) === true ? "running" : "inactive" : member.phase;
			const isCurrent = member.id === sessionId;
			const highlightCurrent = isCurrent && memberCount > 1;
			const inert = isCurrent || status === "failed" || status === "provisioning";
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label: t("open"),
				side: "bottom",
				gap: 4,
				disabled: inert,
				children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: highlightCurrent ? `${TeamAction_module_css_default.member} ${TeamAction_module_css_default.memberCurrent}` : TeamAction_module_css_default.member,
					disabled: inert,
					onClick: () => {
						try {
							openTeammate(sessionId, member.id);
						} catch (reason) {
							onError(String(reason));
						}
					},
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: TeamAction_module_css_default.memberDot,
						children: (renderAvatar?.(member.id) ?? (status === "inactive" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutlineRegular, {
							size: 14,
							className: TeamAction_module_css_default.inactiveIcon
						}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: memberDotState(status) })))
					}), (0, react_jsx_runtime.jsxs)("span", {
						className: TeamAction_module_css_default.memberText,
						children: [
							(0, react_jsx_runtime.jsxs)("span", {
								className: TeamAction_module_css_default.memberName,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.memberNameText,
									children: member.name
								}), isCurrent && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
									tone: "info",
									className: TeamAction_module_css_default.currentTag,
									children: t("current")
								})]
							}),
							(0, react_jsx_runtime.jsxs)("small", { children: [t(memberStatusKey(status)), model !== void 0 && (0, react_jsx_runtime.jsx)("span", {
								className: TeamAction_module_css_default.memberModel,
								children: ` · ${t("model")}: ${model}`
							})] }),
							member.error !== void 0 && (0, react_jsx_runtime.jsx)("small", {
								className: TeamAction_module_css_default.diagnostic,
								children: member.error
							})
						]
					})]
				})
			});
		}
		/** Task card with a two-line description clamp expanded from a toggle in the meta row. */
		function TaskCard({ task, t }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [clamped, setClamped] = (0, react.useState)(false);
			const textRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				if (expanded) return;
				const paragraph = textRef.current;
				/* v8 ignore next -- the paragraph mounts in the same commit as the effect. */
				if (paragraph === null) return;
				const measure = () => {
					setClamped(paragraph.scrollHeight > paragraph.clientHeight + 1);
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(paragraph);
				return () => {
					observer.disconnect();
				};
			}, [task.description, expanded]);
			return (0, react_jsx_runtime.jsxs)("article", {
				className: TeamAction_module_css_default.task,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.taskTitle,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: task.subject }), (0, react_jsx_runtime.jsxs)("span", {
							className: TeamAction_module_css_default.taskState,
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: taskDotState(task) }), (0, react_jsx_runtime.jsx)("span", { children: t(statusKey(task.status)) })]
						})]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						ref: textRef,
						className: expanded ? void 0 : TeamAction_module_css_default.clampedDescription,
						children: task.description
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.meta,
						children: [
							(clamped || expanded) && (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: TeamAction_module_css_default.expandToggle,
								"aria-expanded": expanded,
								onClick: () => {
									setExpanded((current) => !current);
								},
								children: [t(expanded ? "task.collapse" : "task.expand"), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
									size: 12,
									className: expanded ? TeamAction_module_css_default.expandToggleOpen : void 0
								})]
							}),
							(0, react_jsx_runtime.jsx)("span", { children: task.id }),
							(0, react_jsx_runtime.jsxs)("span", { children: [
								t("owner"),
								": ",
								task.ownerName ?? t("unowned")
							] }),
							task.status === "pending" && (0, react_jsx_runtime.jsx)("span", { children: task.ready ? t("ready") : t("blocked") }),
							task.blockedBy.length > 0 && (0, react_jsx_runtime.jsxs)("span", { children: [
								t("blockedBy"),
								": ",
								task.blockedBy.join(", ")
							] }),
							task.writeScopes.length > 0 && (0, react_jsx_runtime.jsxs)("span", { children: [
								t("writeScopes"),
								": ",
								task.writeScopes.join(", ")
							] }),
							task.writeScopeWarnings.map((warning) => (0, react_jsx_runtime.jsx)("span", {
								className: TeamAction_module_css_default.warning,
								children: warning
							}, warning))
						]
					})
				]
			});
		}
		/** Render the Team roster and read-only task board. */
		function TeamAction({ sessionId, useSession, useSessions, useSessionStatus, openTeammate, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const triggerLabelRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: triggerRef,
				panelRef,
				gap: 5,
				margin: 16
			});
			const positioned = position !== null;
			const leadSessionId = useSession((snapshot) => snapshot.subagent?.address.parentSessionId) ?? sessionId;
			const team = useSessions((state) => state.projectionsBySession[leadSessionId]?.values.agentTeam);
			const opening = useSession((snapshot) => snapshot.openState === "loading");
			const listing = useSessions((state) => state.phase === "pending");
			const hoverTimer = (0, react.useRef)(void 0);
			const pinnedRef = (0, react.useRef)(false);
			const cancelHoverChange = () => {
				clearTimeout(hoverTimer.current);
				hoverTimer.current = void 0;
			};
			(0, react.useEffect)(() => {
				cancelHoverChange();
				pinnedRef.current = false;
				setOpen(false);
				setError(null);
			}, [sessionId]);
			(0, react.useEffect)(() => cancelHoverChange, []);
			(0, react.useLayoutEffect)(() => {
				if (open && positioned && pinnedRef.current) panelRef.current?.focus();
			}, [open, positioned]);
			const changeOpen = (next) => {
				cancelHoverChange();
				if (!next) pinnedRef.current = false;
				setOpen(next);
			};
			const scheduleHoverOpen = () => {
				cancelHoverChange();
				if (open) return;
				const label = triggerLabelRef.current;
				/* v8 ignore next -- the label mounts with the trigger that received the hover. */
				if (label === null) return;
				if (getComputedStyle(label).display === "none") return;
				hoverTimer.current = setTimeout(() => {
					hoverTimer.current = void 0;
					changeOpen(true);
				}, 150);
			};
			const scheduleHoverClose = () => {
				cancelHoverChange();
				if (pinnedRef.current) return;
				hoverTimer.current = setTimeout(() => {
					hoverTimer.current = void 0;
					changeOpen(false);
				}, 120);
			};
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, changeOpen, panelRef);
			(0, react.useEffect)(() => {
				if (!open) return;
				const dismiss = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					cancelHoverChange();
					pinnedRef.current = false;
					setOpen(false);
					if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
				};
				document.addEventListener("keydown", dismiss);
				return () => {
					document.removeEventListener("keydown", dismiss);
				};
			}, [open]);
			const compact = team !== void 0 && team.members.length === 1 && team.tasks.length === 0;
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: TeamAction_module_css_default.root,
				"data-team-action": true,
				onMouseLeave: scheduleHoverClose,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					ref: triggerRef,
					onMouseEnter: scheduleHoverOpen,
					className: TeamAction_module_css_default.trigger,
					"aria-label": t("trigger"),
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						cancelHoverChange();
						pinnedRef.current = true;
						if (!open) changeOpen(true);
						else panelRef.current?.focus();
					},
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUsersOutlineRegular, { size: 14 }), (0, react_jsx_runtime.jsx)("span", {
						ref: triggerLabelRef,
						className: TeamAction_module_css_default.triggerLabel,
						children: t("trigger")
					})]
				}), open && (0, react_dom.createPortal)((0, react_jsx_runtime.jsx)("div", {
					ref: panelRef,
					className: compact ? `${TeamAction_module_css_default.panel} ${TeamAction_module_css_default.panelCompact}` : TeamAction_module_css_default.panel,
					style: position ?? {
						visibility: "hidden",
						left: 0,
						top: 0
					},
					role: "dialog",
					tabIndex: -1,
					"aria-label": t("trigger"),
					"data-team-panel": true,
					onMouseEnter: cancelHoverChange,
					onMouseLeave: scheduleHoverClose,
					children: (0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.body,
						children: [
							error !== null && (0, react_jsx_runtime.jsxs)("div", {
								className: TeamAction_module_css_default.error,
								role: "alert",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), error]
							}),
							team === void 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: TeamAction_module_css_default.notice,
								role: "status",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: opening || listing ? "ongoing" : "warning" }), t(opening || listing ? "loading" : "unavailable")]
							}),
							team !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								team.failure !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
									className: TeamAction_module_css_default.error,
									role: "alert",
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), t("failure", { message: team.failure })]
								}),
								(0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsxs)("h3", { children: [t("roster"), team.members.length > 1 && (0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.count,
									children: team.members.length
								})] }), (0, react_jsx_runtime.jsx)("div", {
									className: TeamAction_module_css_default.roster,
									children: team.members.map((member) => (0, react_jsx_runtime.jsx)(TeamMemberRow, {
										member,
										memberCount: team.members.length,
										sessionId,
										useSessions,
										useSessionStatus,
										openTeammate,
										onError: setError,
										t
									}, member.id))
								})] }),
								(0, react_jsx_runtime.jsx)("section", { children: team.tasks.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: TeamAction_module_css_default.emptyNotice,
									children: t("empty")
								}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("h3", { children: [t("tasks"), (0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.count,
									children: team.tasks.length
								})] }), (0, react_jsx_runtime.jsx)("div", {
									className: TeamAction_module_css_default.tasks,
									children: team.tasks.map((task) => (0, react_jsx_runtime.jsx)(TaskCard, {
										task,
										t
									}, task.id))
								})] }) })
							] })
						]
					})
				}), document.body)]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Agent Teams Web dictionaries. */
		/** Locale namespace owned by the Agent Teams Web UI. */
		const NS = "agent-team";
		/** Simplified Chinese dictionary and key source. */
		const zh = {
			trigger: "智能体团队",
			loading: "正在加载团队…",
			unavailable: "Team 暂不可用",
			failure: "团队持久记录无效：{message}",
			empty: "暂无共享任务，可以通过对话创建",
			roster: "成员",
			tasks: "共享任务",
			model: "模型",
			open: "打开成员会话",
			current: "当前会话",
			owner: "Owner",
			unowned: "未分配",
			blockedBy: "依赖",
			writeScopes: "写入范围",
			ready: "可开始",
			blocked: "被依赖阻塞",
			"task.expand": "展开",
			"task.collapse": "收起",
			"memberStatus.running": "运行中",
			"memberStatus.inactive": "未运行",
			"memberStatus.provisioning": "准备中",
			"memberStatus.failed": "失败",
			"status.pending": "待处理",
			"status.in_progress": "进行中",
			"status.completed": "已完成"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			trigger: "Agent Team",
			loading: "Loading Team…",
			unavailable: "Team is unavailable",
			failure: "Invalid persisted Team record: {message}",
			empty: "No shared tasks yet. Create them through the conversation.",
			roster: "Members",
			tasks: "Shared tasks",
			model: "Model",
			open: "Open member conversation",
			current: "Current chat",
			owner: "Owner",
			unowned: "Unowned",
			blockedBy: "Blocked by",
			writeScopes: "Write scopes",
			ready: "Ready",
			blocked: "Blocked by dependencies",
			"task.expand": "Show more",
			"task.collapse": "Show less",
			"memberStatus.running": "Running",
			"memberStatus.inactive": "Inactive",
			"memberStatus.provisioning": "Provisioning",
			"memberStatus.failed": "Failed",
			"status.pending": "Pending",
			"status.in_progress": "In progress",
			"status.completed": "Completed"
		};
		//#endregion
		//#region lib/types/client/mount.js
		/** Source-safe Agent Teams browser registration. */
		/** Required browser services for navigation, slots, and localized copy. */
		const inject = [
			"sessions",
			"uiWorkspace",
			"slots",
			"locale"
		];
		/**
		* Register the Team locale dictionaries and the conversation-header action.
		* The panel reads the Lead Session's `agentTeam` projection from the shared
		* Session store; this registration performs no Team RPC.
		* @param ctx - Client Context carrying the injected navigation, locale, slot, and Session services.
		*/
		function registerAgentTeamUi(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "client-ui-agent-team: dictionaries");
			const sessions = ctx.sessions;
			const leadSessionId = (sessionId) => {
				return (sessions.binding(sessionId)?.session.getSnapshot().subagent?.address)?.parentSessionId ?? sessionId;
			};
			const actions = { openTeammate(sessionId, childSessionId) {
				const parentSessionId = leadSessionId(sessionId);
				if ((sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) === 0) return;
				if (childSessionId === parentSessionId) {
					ctx.uiWorkspace.openSession(parentSessionId);
					return;
				}
				ctx.uiWorkspace.openSession({
					parentSessionId,
					childSessionId,
					mode: "continuable"
				});
			} };
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "agent-team",
				order: -20,
				locale: NS,
				inject: () => actions
			}, TeamAction));
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Browser entry registering the Agent Teams conversation-header action. */
		/**
		* Register the Team locale dictionaries and header action on the Client Context.
		* @param ctx - Client Context with the declared `inject` services available.
		*/
		function apply(ctx) {
			registerAgentTeamUi(ctx);
		}
		//#endregion
		function TeamPanel({sessionId, team, useSessions, useSessionStatus, openTeammate, renderAvatar, t}) {
      const [error,setError] = react.useState(null); const opening = false, listing = false;
      return (0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.body,
						children: [
							error !== null && (0, react_jsx_runtime.jsxs)("div", {
								className: TeamAction_module_css_default.error,
								role: "alert",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), error]
							}),
							team === void 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: TeamAction_module_css_default.notice,
								role: "status",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: opening || listing ? "ongoing" : "warning" }), t(opening || listing ? "loading" : "unavailable")]
							}),
							team !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								team.failure !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
									className: TeamAction_module_css_default.error,
									role: "alert",
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), t("failure", { message: team.failure })]
								}),
								(0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsxs)("h3", { children: [t("roster"), team.members.length > 1 && (0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.count,
									children: team.members.length
								})] }), (0, react_jsx_runtime.jsx)("div", {
									className: TeamAction_module_css_default.roster,
									children: team.members.map((member) => (0, react_jsx_runtime.jsx)(TeamMemberRow, {
										member, renderAvatar,
										memberCount: team.members.length,
										sessionId,
										useSessions,
										useSessionStatus,
										openTeammate,
										onError: setError,
										t
									}, member.id))
								})] }),
								(0, react_jsx_runtime.jsx)("section", { children: team.tasks.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: TeamAction_module_css_default.emptyNotice,
									children: t("empty")
								}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("h3", { children: [t("tasks"), (0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.count,
									children: team.tasks.length
								})] }), (0, react_jsx_runtime.jsx)("div", {
									className: TeamAction_module_css_default.tasks,
									children: team.tasks.map((task) => (0, react_jsx_runtime.jsx)(TaskCard, {
										task,
										t
									}, task.id))
								})] }) })
							] })
						]
					});
    }
exports.TeamPanel = TeamPanel; exports.locale = {zh,en};
exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});


return record.factory(require); }
// dsh-client-ui-jobs 0.2.1-rc.2; upstream SHA-256 ad8f57b1b5b9adcd09b197b97ced17e3da4b9dcd0615d25a07f1282beba89fc8
export function createJobsOverview(require) { let record; const window = {__ModuleLoader__: {load(value) { record=value; }}};
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-jobs",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-jobs/src/client/JobListAction.module.css.mjs
		const css = ".QsffPG_trigger{border-radius:var(--dsw-radius-sm);min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:3px;padding:3px 2px;font-size:12px;line-height:18px;display:inline-flex}.QsffPG_trigger:hover,.QsffPG_trigger:focus-visible{color:var(--dsw-alias-label-secondary)}.QsffPG_trigger svg{transition:transform .12s}.QsffPG_triggerOpen{transform:rotate(180deg)}.QsffPG_triggerDot{flex:none}.QsffPG_count{margin:0 5px}.QsffPG_menu{z-index:100;box-sizing:border-box;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:500px;max-width:min(560px,100vw - 32px);max-height:min(480px,100vh - 140px);box-shadow:var(--dsw-elevation-prominent);flex-direction:column;display:flex;position:fixed;overflow:hidden}.QsffPG_menuBody{flex-direction:column;gap:1px;min-height:0;margin:0;padding:4px;list-style:none;display:flex;overflow:auto}.QsffPG_sectionHeader{border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);justify-content:space-between;align-items:center;margin:4px 4px 1px;padding:4px 0 3px;font-size:11px;line-height:16px;display:flex}.QsffPG_sectionHeader:first-child{border-top:0;margin-top:0}.QsffPG_sectionToggle,.QsffPG_sectionClear{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:3px;padding:2px 4px;font-size:11px;line-height:16px;display:inline-flex}.QsffPG_sectionToggle:hover,.QsffPG_sectionToggle:focus-visible,.QsffPG_sectionClear:hover,.QsffPG_sectionClear:focus-visible{background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-secondary)}.QsffPG_sectionChevron{transition:transform .12s;transform:rotate(-90deg)}.QsffPG_sectionChevronOpen{transform:none}.QsffPG_item{flex-direction:column;display:flex}.QsffPG_rowLine{align-items:stretch;gap:6px;display:flex}.QsffPG_rowLineLive{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-fill-l2);padding:4px 8px 4px 2px}.QsffPG_rowLineLive:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent)}.QsffPG_rowLineLive .QsffPG_kind{background:var(--dsw-specific-menu)}.QsffPG_rowLine .QsffPG_row{flex:1;min-width:0}.QsffPG_rowLineLive .QsffPG_row:hover{background:0 0}.QsffPG_rowLineLive .QsffPG_row{border-radius:var(--dsw-radius-sm)}.QsffPG_rowLineLive .QsffPG_row:focus-visible{background:color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent)}.QsffPG_chevronBox{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-menu);flex:none;justify-content:center;align-self:center;align-items:center;width:20px;height:20px;display:inline-flex}.QsffPG_stop{border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:var(--dsw-specific-menu);width:20px;height:20px;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none;justify-content:center;align-self:center;align-items:center;padding:0;display:inline-flex}.QsffPG_stop:hover,.QsffPG_stop:focus-visible{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);color:var(--dsw-alias-state-error-primary)}.QsffPG_stopArmed,.QsffPG_stopArmed:hover,.QsffPG_stopArmed:focus-visible{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent);width:auto;color:var(--dsw-alias-state-error-primary);gap:4px;padding:0 7px}.QsffPG_stopLabel{white-space:nowrap;font-size:11px;line-height:18px}.QsffPG_stopFailed{color:var(--dsw-alias-state-error-primary)}.QsffPG_row{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:100%;min-height:28px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;align-items:center;gap:6px;padding:4px 7px;font-size:12px;line-height:17px;display:flex}.QsffPG_row:hover,.QsffPG_row:focus-visible{background:var(--dsw-alias-fill-l1)}.QsffPG_rowStatic{cursor:default}.QsffPG_rowStatic:hover{background:0 0}.QsffPG_rowSettled{color:var(--dsw-alias-label-tertiary)}.QsffPG_row .QsffPG_rowDot{flex:none}.QsffPG_main{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.QsffPG_primary{align-items:baseline;gap:8px;min-width:0;display:flex}.QsffPG_secondary{align-items:center;gap:6px;min-width:0;display:flex}.QsffPG_kind{border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary);flex:none;padding:0 5px;font-size:10px;line-height:16px}.QsffPG_label{min-width:0;font-family:var(--dsw-font-mono);white-space:nowrap;text-overflow:ellipsis;flex:1;overflow:hidden}.QsffPG_status{max-width:60%;color:var(--dsw-alias-label-tertiary);white-space:nowrap;text-overflow:ellipsis;flex:none;font-size:10px;line-height:16px;overflow:hidden}.QsffPG_duration{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;flex:none;font-size:11px;line-height:18px}.QsffPG_chevron{color:var(--dsw-alias-label-tertiary);flex:none}.QsffPG_chevronOpen{transform:rotate(180deg)}.QsffPG_panel{--dsl-terminal-command-whitespace:pre-wrap;--dsl-terminal-line-whitespace:pre-wrap;--dsl-terminal-output-max-height:288px;margin:0 8px 8px}.QsffPG_panel [data-terminal]{--dsl-terminal-gutter:12px}.QsffPG_notice{color:var(--dsw-alias-label-tertiary);margin:0 8px 6px;font-size:11px;line-height:16px}.QsffPG_noticeError{color:var(--dsw-alias-state-error-primary)}";
		const tagId = "trisoul_x/overview/dsh-client-ui-jobs/JobListAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "trisoul_x";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var JobListAction_module_css_default = {
			"chevron": "QsffPG_chevron",
			"chevronBox": "QsffPG_chevronBox",
			"chevronOpen": "QsffPG_chevronOpen",
			"count": "QsffPG_count",
			"duration": "QsffPG_duration",
			"item": "QsffPG_item",
			"kind": "QsffPG_kind",
			"label": "QsffPG_label",
			"main": "QsffPG_main",
			"menu": "QsffPG_menu",
			"menuBody": "QsffPG_menuBody",
			"notice": "QsffPG_notice",
			"noticeError": "QsffPG_noticeError",
			"panel": "QsffPG_panel",
			"primary": "QsffPG_primary",
			"row": "QsffPG_row",
			"rowDot": "QsffPG_rowDot",
			"rowLine": "QsffPG_rowLine",
			"rowLineLive": "QsffPG_rowLineLive",
			"rowSettled": "QsffPG_rowSettled",
			"rowStatic": "QsffPG_rowStatic",
			"secondary": "QsffPG_secondary",
			"sectionChevron": "QsffPG_sectionChevron",
			"sectionChevronOpen": "QsffPG_sectionChevronOpen",
			"sectionClear": "QsffPG_sectionClear",
			"sectionHeader": "QsffPG_sectionHeader",
			"sectionToggle": "QsffPG_sectionToggle",
			"status": "QsffPG_status",
			"stop": "QsffPG_stop",
			"stopArmed": "QsffPG_stopArmed",
			"stopFailed": "QsffPG_stopFailed",
			"stopLabel": "QsffPG_stopLabel",
			"trigger": "QsffPG_trigger",
			"triggerDot": "QsffPG_triggerDot",
			"triggerOpen": "QsffPG_triggerOpen"
		};
		//#endregion
		//#region lib/types/client/JobListAction.js
		/** Stable empty list so a session with no jobs keeps one array identity. */
		const NO_JOBS = [];
		/** Minimum gap kept between the popover and the viewport edges (the Menu primitive's portal margin). */
		const VIEWPORT_MARGIN = 12;
		/** Distance between the trigger's bottom edge and the popover. */
		const MENU_GAP = 5;
		/** Unplaced list: hidden but laid out so the first placement measures real dimensions. */
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		/** Keyboard-reachable controls inside the list, in document order. */
		const FOCUSABLE = "button:not(:disabled), a[href], [tabindex]:not([tabindex=\"-1\"])";
		/** How long an armed kill waits for its confirming press before disarming. */
		const KILL_ARM_MS = 3e3;
		/** How long a failed kill keeps its hint before the button resets. */
		const KILL_FAILED_MS = 4e3;
		function isLive(job) {
			return job.status === "running" || job.status === "stopping";
		}
		/**
		* Whether the row offers an output panel: every live job (its output may
		* still arrive) and a settled one that left retained output behind.
		*/
		function isObservable(job) {
			return isLive(job) || job.output.total > 0;
		}
		/** The one-line qualifier beside the status: live progress while running, the terminal reason once settled. */
		function jobDetail(job) {
			return job.progress ?? job.detail;
		}
		/** Closed-union exhaustiveness fence for the wire status set. */
		/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
		function assertNever(value) {
			throw new Error(`unhandled job status: ${JSON.stringify(value)}`);
		}
		/**
		* Status marker semantics. `stopping` and `killed` share the attention color:
		* both mean the work ended (or is ending) on request rather than on its own.
		*/
		function dotState(status) {
			switch (status) {
				case "running": return "ongoing";
				case "stopping": return "warning";
				case "completed": return "done";
				case "killed": return "warning";
				case "failed": return "error";
				/* v8 ignore next -- closed wire status union */
				default: return assertNever(status);
			}
		}
		function statusLabel(status, t) {
			switch (status) {
				case "running": return t("status.running");
				case "stopping": return t("status.stopping");
				case "completed": return t("status.completed");
				case "killed": return t("status.killed");
				case "failed": return t("status.failed");
				/* v8 ignore next -- closed wire status union */
				default: return assertNever(status);
			}
		}
		/**
		* Elapsed time in at most two adjacent units. A job that outlives an hour is
		* already exceptional, so hours is the widest unit — beyond that the figure
		* stays in hours rather than growing a day/month vocabulary no producer
		* currently reaches.
		*/
		function formatDuration(elapsedMs, t) {
			const total = Math.max(0, Math.floor(elapsedMs / 1e3));
			const seconds = total % 60;
			const minutes = Math.floor(total / 60) % 60;
			const hours = Math.floor(total / 3600);
			if (hours > 0) return t("duration.hours", {
				hours,
				minutes
			});
			if (minutes > 0) return t("duration.minutes", {
				minutes,
				seconds
			});
			return t("duration.seconds", { seconds });
		}
		/** Localized display copy for the embedded terminal panel. */
		function terminalLabels(t) {
			return {
				commandLine: (line) => t("terminal.commandLine", { n: line }),
				/* v8 ignore next */
				signal: (signal) => t("terminal.signal", { signal }),
				/* v8 ignore next */
				exitCode: (code) => t("terminal.exitCode", { code }),
				noExitCode: t("terminal.noExitCode"),
				running: t("terminal.running"),
				failed: t("terminal.failed"),
				done: t("terminal.done"),
				copy: t("terminal.copy"),
				copied: t("terminal.copied"),
				noOutput: t("terminal.noOutput"),
				collapseAria: t("terminal.collapseAria"),
				collapse: t("terminal.collapse"),
				/* v8 ignore next */
				expandAria: (hidden) => t("terminal.expandAria", { n: hidden }),
				/* v8 ignore next */
				expand: (hidden) => t("terminal.expand", { n: hidden })
			};
		}
		/**
		* Live rows first in start order, then settled rows newest-first. Two rows
		* that settled in the same millisecond fall back to start order, so the sort
		* never depends on the host's map iteration.
		*/
		function ordered(jobs) {
			return [...jobs].sort((left, right) => {
				const liveLeft = isLive(left);
				if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
				if (liveLeft) return left.startedAt - right.startedAt;
				const finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
				return finished !== 0 ? finished : left.startedAt - right.startedAt;
			});
		}
		/** One job row plus, when observable and expanded, its live output panel. */
		function JobItem({ job, view, expanded, now, onToggle, kill, t }) {
			const live = isLive(job);
			const status = statusLabel(job.status, t);
			const detail = jobDetail(job);
			const observable = isObservable(job);
			const labels = (0, react.useMemo)(() => terminalLabels(t), [t]);
			const duration = formatDuration(live ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt, t);
			const durationCell = (0, react_jsx_runtime.jsx)("span", {
				className: JobListAction_module_css_default.duration,
				title: t(live ? "duration.title.live" : "duration.title.done", { duration }),
				children: duration
			});
			const body = live ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
					state: dotState(job.status),
					className: JobListAction_module_css_default.rowDot
				}),
				(0, react_jsx_runtime.jsxs)("span", {
					className: JobListAction_module_css_default.main,
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: JobListAction_module_css_default.primary,
						children: (0, react_jsx_runtime.jsx)("span", {
							className: JobListAction_module_css_default.label,
							title: job.label,
							children: job.label
						})
					}), (0, react_jsx_runtime.jsxs)("span", {
						className: JobListAction_module_css_default.secondary,
						title: detail ?? status,
						children: [
							(0, react_jsx_runtime.jsx)("span", {
								className: JobListAction_module_css_default.kind,
								children: job.kind
							}),
							detail !== void 0 ? (0, react_jsx_runtime.jsx)("span", {
								className: JobListAction_module_css_default.status,
								children: detail
							}) : null,
							durationCell
						]
					})]
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: JobListAction_module_css_default.chevronBox,
					children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
						size: 12,
						className: expanded ? `${JobListAction_module_css_default.chevron} ${JobListAction_module_css_default.chevronOpen}` : JobListAction_module_css_default.chevron
					})
				})
			] }) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
					state: dotState(job.status),
					className: JobListAction_module_css_default.rowDot
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: JobListAction_module_css_default.kind,
					children: job.kind
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: JobListAction_module_css_default.label,
					title: job.label,
					children: job.label
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: JobListAction_module_css_default.status,
					title: detail ?? status,
					children: detail ?? status
				}),
				durationCell,
				observable ? (0, react_jsx_runtime.jsx)("span", {
					className: JobListAction_module_css_default.chevronBox,
					children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
						size: 12,
						className: expanded ? `${JobListAction_module_css_default.chevron} ${JobListAction_module_css_default.chevronOpen}` : JobListAction_module_css_default.chevron
					})
				}) : null
			] });
			const killTitle = kill === void 0 ? void 0 : kill.state === "armed" ? t("kill.confirm") : kill.state === "failed" ? t("kill.failed") : t("kill.stop", { label: job.label });
			return (0, react_jsx_runtime.jsxs)("li", {
				className: JobListAction_module_css_default.item,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: live ? `${JobListAction_module_css_default.rowLine} ${JobListAction_module_css_default.rowLineLive}` : JobListAction_module_css_default.rowLine,
					children: [observable ? (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: live ? JobListAction_module_css_default.row : `${JobListAction_module_css_default.row} ${JobListAction_module_css_default.rowSettled}`,
						"aria-expanded": expanded,
						"aria-label": t(expanded ? "row.collapseAria" : "row.expandAria", { label: job.label }),
						onClick: onToggle,
						children: body
					}) : (0, react_jsx_runtime.jsx)("span", {
						className: `${JobListAction_module_css_default.row} ${JobListAction_module_css_default.rowSettled} ${JobListAction_module_css_default.rowStatic}`,
						children: body
					}), kill !== void 0 ? (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: kill.state === "armed" ? `${JobListAction_module_css_default.stop} ${JobListAction_module_css_default.stopArmed}` : kill.state === "failed" ? `${JobListAction_module_css_default.stop} ${JobListAction_module_css_default.stopFailed}` : JobListAction_module_css_default.stop,
						"data-kill-state": kill.state,
						disabled: kill.state === "pending",
						"aria-label": killTitle,
						title: killTitle,
						onClick: kill.onPress,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconStopFillRegular, { size: 10 }), kill.state === "armed" ? (0, react_jsx_runtime.jsx)("span", {
							className: JobListAction_module_css_default.stopLabel,
							children: t("kill.confirmAction")
						}) : null]
					}) : null]
				}), expanded && view !== void 0 ? (0, react_jsx_runtime.jsxs)("div", {
					className: JobListAction_module_css_default.panel,
					children: [
						view.gapBefore ? (0, react_jsx_runtime.jsx)("div", {
							className: JobListAction_module_css_default.notice,
							children: t("output.gap")
						}) : null,
						view.error !== void 0 ? (0, react_jsx_runtime.jsx)("div", {
							className: `${JobListAction_module_css_default.notice} ${JobListAction_module_css_default.noticeError}`,
							children: t("output.error", { error: view.error })
						}) : null,
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
							command: job.label,
							output: view.text,
							running: live,
							copyText: job.label,
							runStateDot: false,
							maxLines: Number.POSITIVE_INFINITY,
							labels
						})
					]
				}) : null]
			});
		}
		/**
		* Session-header entry point for this session's background jobs. Mounting it
		* keeps the session's roster stream open; it renders nothing at all until the
		* session can see at least one job. Expanding an observable row (a live job,
		* or a settled one with retained output) starts its observation stream, and
		* collapsing (or closing the popover) stops it — output only flows while
		* someone is watching. A running row carries a two-press stop button that
		* requests a human kill through the job controller.
		* @param props - runtime slot currency, the jobs snapshot hook, the roster,
		*   observation, and kill controls, and the namespace translator.
		* @returns the trigger and its popover list, or null when there is nothing to show.
		*/
		function JobListAction({ sessionId, useJobs, watchRows, observe, killJob, t }) {
			const jobs = useJobs((state) => state.rows[sessionId]) ?? NO_JOBS;
			const observedViews = useJobs((state) => state.observed);
			const [open, setOpen] = (0, react.useState)(false);
			const [expandedKey, setExpandedKey] = (0, react.useState)(void 0);
			const [now, setNow] = (0, react.useState)(() => Date.now());
			const [settledOpen, setSettledOpen] = (0, react.useState)(void 0);
			const [clearedKeys, setClearedKeys] = (0, react.useState)(() => /* @__PURE__ */ new Set());
			const [killPhase, setKillPhase] = (0, react.useState)(void 0);
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const menuRef = (0, react.useRef)(null);
			const rows = (0, react.useMemo)(() => ordered(jobs), [jobs]);
			const liveRows = (0, react.useMemo)(() => rows.filter(isLive), [rows]);
			const settledRows = (0, react.useMemo)(() => rows.filter((job) => !isLive(job) && !clearedKeys.has(String(job.id))), [rows, clearedKeys]);
			const settledExpanded = settledOpen ?? liveRows.length === 0;
			const visibleCount = liveRows.length + settledRows.length;
			const menuPosition = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: rootRef,
				panelRef: menuRef,
				gap: MENU_GAP,
				margin: VIEWPORT_MARGIN
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen, menuRef);
			(0, react.useEffect)(() => watchRows(sessionId), [sessionId, watchRows]);
			(0, react.useEffect)(() => {
				if (!open || liveRows.length === 0) return;
				setNow(Date.now());
				const timer = setInterval(() => {
					setNow(Date.now());
				}, 1e3);
				return () => {
					clearInterval(timer);
				};
			}, [open, liveRows.length]);
			const expandedRow = open && expandedKey !== void 0 ? rows.find((job) => String(job.id) === expandedKey) : void 0;
			const activeJob = expandedRow !== void 0 && isObservable(expandedRow) ? expandedRow.id : void 0;
			(0, react.useEffect)(() => {
				if (activeJob === void 0) return;
				return observe(sessionId, activeJob);
			}, [
				sessionId,
				activeJob,
				observe
			]);
			(0, react.useEffect)(() => {
				if (visibleCount === 0 && open) setOpen(false);
			}, [visibleCount, open]);
			(0, react.useEffect)(() => {
				if (expandedKey !== void 0 && !rows.some((job) => String(job.id) === expandedKey)) setExpandedKey(void 0);
			}, [rows, expandedKey]);
			(0, react.useEffect)(() => {
				if (killPhase === void 0 || killPhase.state === "pending") return;
				const timer = setTimeout(() => {
					setKillPhase(void 0);
				}, killPhase.state === "armed" ? KILL_ARM_MS : KILL_FAILED_MS);
				return () => {
					clearTimeout(timer);
				};
			}, [killPhase]);
			(0, react.useEffect)(() => {
				if (killPhase !== void 0 && !rows.some((job) => String(job.id) === killPhase.key && job.status === "running")) setKillPhase(void 0);
			}, [rows, killPhase]);
			const pressKill = (job) => {
				const key = String(job.id);
				if (killPhase?.key !== key || killPhase.state !== "armed") {
					setKillPhase({
						key,
						state: "armed"
					});
					return;
				}
				setKillPhase({
					key,
					state: "pending"
				});
				killJob(sessionId, key).then((ok) => {
					setKillPhase((current) => current?.key === key && !ok ? {
						key,
						state: "failed"
					} : current);
				});
			};
			if (visibleCount === 0) return null;
			const countLabel = t(liveRows.length > 0 ? liveRows.length === 1 ? "count.live.one" : "count.live.other" : visibleCount === 1 ? "count.idle.one" : "count.idle.other", { count: liveRows.length > 0 ? liveRows.length : visibleCount });
			const clearSettled = () => {
				setClearedKeys((current) => {
					const next = new Set(current);
					for (const job of settledRows) next.add(String(job.id));
					return next;
				});
				if (expandedKey !== void 0 && settledRows.some((job) => String(job.id) === expandedKey)) setExpandedKey(void 0);
			};
			const onKeyDown = (event) => {
				if (!open) return;
				const trigger = triggerRef.current;
				if (event.key === "Escape") {
					event.preventDefault();
					setOpen(false);
					trigger?.focus();
					return;
				}
				const menu = menuRef.current;
				/* v8 ignore next -- both refs are attached while the open list renders. */
				if (event.key !== "Tab" || trigger === null || menu === null) return;
				const focusable = [...menu.querySelectorAll(FOCUSABLE)];
				if (event.target === trigger) {
					if (event.shiftKey) return;
					event.preventDefault();
					focusable[0]?.focus();
				} else if (event.shiftKey ? event.target === focusable[0] : event.target === focusable.at(-1)) {
					if (event.shiftKey) event.preventDefault();
					trigger.focus();
				}
			};
			const item = (job) => (0, react_jsx_runtime.jsx)(JobItem, {
				job,
				view: isObservable(job) ? observedViews[String(job.id)] : void 0,
				expanded: expandedKey === String(job.id),
				now,
				onToggle: () => {
					setExpandedKey((current) => current === String(job.id) ? void 0 : String(job.id));
				},
				...job.status === "running" ? { kill: {
					state: killPhase?.key === String(job.id) ? killPhase.state : "idle",
					onPress: () => {
						pressKill(job);
					}
				} } : {},
				t
			}, String(job.id));
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				onKeyDown,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: JobListAction_module_css_default.trigger,
					"aria-expanded": open,
					"aria-label": countLabel,
					onClick: () => {
						setNow(Date.now());
						setOpen((current) => !current);
					},
					children: [
						liveRows.length > 0 ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: "ongoing",
							className: JobListAction_module_css_default.triggerDot
						}) : null,
						(0, react_jsx_runtime.jsx)("span", {
							className: JobListAction_module_css_default.count,
							children: countLabel
						}),
						(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
							size: 12,
							className: open ? JobListAction_module_css_default.triggerOpen : void 0
						})
					]
				}), open ? (0, react_dom.createPortal)((0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuSurface, {
					ref: menuRef,
					className: JobListAction_module_css_default.menu,
					style: menuPosition ?? MEASURE_STYLE,
					children: (0, react_jsx_runtime.jsxs)("ul", {
						className: JobListAction_module_css_default.menuBody,
						"aria-label": t("list.aria"),
						children: [
							liveRows.length > 0 ? (0, react_jsx_runtime.jsx)("li", {
								className: JobListAction_module_css_default.sectionHeader,
								"aria-hidden": "true",
								children: t("section.live")
							}) : null,
							liveRows.map(item),
							settledRows.length > 0 ? (0, react_jsx_runtime.jsxs)("li", {
								className: JobListAction_module_css_default.sectionHeader,
								children: [(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: JobListAction_module_css_default.sectionToggle,
									"aria-expanded": settledExpanded,
									onClick: () => {
										setSettledOpen(!settledExpanded);
									},
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
										size: 12,
										className: settledExpanded ? `${JobListAction_module_css_default.sectionChevron} ${JobListAction_module_css_default.sectionChevronOpen}` : JobListAction_module_css_default.sectionChevron
									}), t("section.settledCount", { count: settledRows.length })]
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: JobListAction_module_css_default.sectionClear,
									onClick: clearSettled,
									children: t("section.clear")
								})]
							}) : null,
							settledExpanded ? settledRows.map(item) : null
						]
					})
				}), document.body) : null]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"count.live.one": "{count} 个后台任务运行中",
			"count.live.other": "{count} 个后台任务运行中",
			"count.idle.one": "{count} 个后台任务",
			"count.idle.other": "{count} 个后台任务",
			"list.aria": "后台任务",
			"section.live": "进行中",
			"section.settledCount": "已结束 {count}",
			"section.clear": "清空",
			"row.expandAria": "展开 {label} 的实时输出",
			"row.collapseAria": "收起 {label} 的实时输出",
			"kill.stop": "停止任务 {label}",
			"kill.confirm": "再次点击确认停止",
			"kill.confirmAction": "确认停止",
			"kill.failed": "停止失败",
			"status.running": "运行中",
			"status.stopping": "正在停止",
			"status.completed": "已完成",
			"status.killed": "已取消",
			"status.failed": "已失败",
			"duration.seconds": "{seconds}秒",
			"duration.minutes": "{minutes}分{seconds}秒",
			"duration.hours": "{hours}小时{minutes}分",
			"duration.title.live": "已运行 {duration}",
			"duration.title.done": "耗时 {duration}",
			"output.gap": "……较早的输出已丢弃……",
			"output.error": "实时输出流中断：{error}",
			"terminal.signal": "信号 {signal}",
			"terminal.exitCode": "退出码 {code}",
			"terminal.noExitCode": "未正常退出",
			"terminal.commandLine": "命令第 {n} 行",
			"terminal.running": "运行中",
			"terminal.failed": "已失败",
			"terminal.done": "已完成",
			"terminal.copy": "复制",
			"terminal.copied": "已复制",
			"terminal.noOutput": "（无输出）",
			"terminal.collapse": "收起",
			"terminal.collapseAria": "收起输出",
			"terminal.expand": "展开其余 {n} 行",
			"terminal.expandAria": "展开被折叠的 {n} 行输出"
		};
		/** English dictionary, key-identical to the Chinese source of truth. */
		const en = {
			"count.live.one": "{count} background job running",
			"count.live.other": "{count} background jobs running",
			"count.idle.one": "{count} background job",
			"count.idle.other": "{count} background jobs",
			"list.aria": "Background jobs",
			"section.live": "Running",
			"section.settledCount": "Finished {count}",
			"section.clear": "Clear",
			"row.expandAria": "Show live output of {label}",
			"row.collapseAria": "Hide live output of {label}",
			"kill.stop": "Stop task {label}",
			"kill.confirm": "Click again to confirm",
			"kill.confirmAction": "Confirm stop",
			"kill.failed": "Stop failed",
			"status.running": "running",
			"status.stopping": "stopping",
			"status.completed": "completed",
			"status.killed": "cancelled",
			"status.failed": "failed",
			"duration.seconds": "{seconds}s",
			"duration.minutes": "{minutes}m {seconds}s",
			"duration.hours": "{hours}h {minutes}m",
			"duration.title.live": "Running for {duration}",
			"duration.title.done": "Took {duration}",
			"output.gap": "… earlier output dropped …",
			"output.error": "live output stream interrupted: {error}",
			"terminal.signal": "signal {signal}",
			"terminal.exitCode": "exit {code}",
			"terminal.noExitCode": "no exit code",
			"terminal.commandLine": "Command line {n}",
			"terminal.running": "running",
			"terminal.failed": "failed",
			"terminal.done": "done",
			"terminal.copy": "Copy",
			"terminal.copied": "Copied",
			"terminal.noOutput": "(no output)",
			"terminal.collapse": "Collapse",
			"terminal.collapseAria": "Collapse output",
			"terminal.expand": "Show {n} more lines",
			"terminal.expandAria": "Expand {n} collapsed output lines"
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Required services: the jobs rosters, observations, and kill, the slot registry, and dictionaries. */
		const inject = [
			"jobs",
			"slots",
			"locale"
		];
		/**
		* Client plugin body: register the dictionaries and the header action.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("job", {
				zh,
				en
			}), "ui-jobs: dictionaries");
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "job-list",
				order: 20,
				locale: "job",
				inject: () => ({
					hooks: { jobs: ctx.jobs.state },
					watchRows: (sessionId) => ctx.jobs.watchRows(sessionId),
					observe: (sessionId, id) => ctx.jobs.observe(sessionId, id),
					killJob: async (sessionId, jobId) => (await ctx.jobs.kill(sessionId, jobId)).ok
				})
			}, JobListAction));
		}
		//#endregion
		function JobsBody({liveRows, settledRows, item, settledExpanded, setSettledOpen, clearSettled, t}) { return (0, react_jsx_runtime.jsxs)("ul", {
						className: JobListAction_module_css_default.menuBody,
						"aria-label": t("list.aria"),
						children: [
							liveRows.length > 0 ? (0, react_jsx_runtime.jsx)("li", {
								className: JobListAction_module_css_default.sectionHeader,
								"aria-hidden": "true",
								children: t("section.live")
							}) : null,
							liveRows.map(item),
							settledRows.length > 0 ? (0, react_jsx_runtime.jsxs)("li", {
								className: JobListAction_module_css_default.sectionHeader,
								children: [(0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: JobListAction_module_css_default.sectionToggle,
									"aria-expanded": settledExpanded,
									onClick: () => {
										setSettledOpen(!settledExpanded);
									},
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
										size: 12,
										className: settledExpanded ? `${JobListAction_module_css_default.sectionChevron} ${JobListAction_module_css_default.sectionChevronOpen}` : JobListAction_module_css_default.sectionChevron
									}), t("section.settledCount", { count: settledRows.length })]
								}), (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: JobListAction_module_css_default.sectionClear,
									onClick: clearSettled,
									children: t("section.clear")
								})]
							}) : null,
							settledExpanded ? settledRows.map(item) : null
						]
					}); }
      exports.JobsBody = JobsBody; exports.JobItem = JobItem; exports.isObservable = isObservable;
      exports.ordered = ordered; exports.isLive = isLive; exports.styles = JobListAction_module_css_default; exports.locale = {zh,en};
exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});


return record.factory(require); }
// dsh-client-ui-workflow-run 0.2.1-rc.2; upstream SHA-256 c0e08d98885bfc4733c470c80520a460798060ccb9d08778bbef3dfc8011cbcf
export function createWorkflowOverview(require) { let record; const window = {__ModuleLoader__: {load(value) { record=value; }}};
window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-workflow-run",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-workflow-run/src/client/WorkflowRunPanel.module.css.mjs
		const css = ".DBuyfa_root{width:100%;min-width:0}.DBuyfa_runHeader{box-sizing:border-box;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);align-items:center;gap:6px;width:100%;min-width:0;height:32px;padding:0 8px;display:flex}.DBuyfa_runHeader:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}.DBuyfa_runLeading{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));color:inherit;flex:none;justify-content:center;align-items:center;margin-right:0;display:inline-flex}.DBuyfa_runTitle{max-width:42%;color:inherit;font-size:var(--dsh-content-font-size-secondary,13px);font-weight:510;line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:none;overflow:hidden}.DBuyfa_runSummary{min-width:0;color:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.DBuyfa_statusTail{height:20px;color:inherit;white-space:nowrap;flex:none;align-items:center;gap:4px;font-size:11px;font-weight:510;line-height:16px;display:inline-flex;overflow:hidden}.DBuyfa_phaseHeader{box-sizing:border-box;align-items:center;gap:6px;width:100%;min-width:0;height:32px;display:flex}.DBuyfa_phaseHeader:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px;border-radius:var(--dsw-radius-md)}.DBuyfa_phaseLeading{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));color:inherit;flex:none;justify-content:center;align-items:center;margin-right:0;display:inline-flex}.DBuyfa_phaseTitle{min-width:0;max-width:42%;color:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:0 auto;overflow:hidden}.DBuyfa_phaseCount{min-width:0;color:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.DBuyfa_phaseStatus{width:calc(132px + var(--dsh-content-font-delta-secondary,0px) * 10);color:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));text-align:right;text-overflow:ellipsis;white-space:nowrap;flex:none;overflow:hidden}.DBuyfa_separator{corner-shape:round;background:var(--dsw-alias-label-tertiary);border-radius:50%;flex:none;width:2px;height:2px}.DBuyfa_phaseList{flex-direction:column;gap:4px;min-width:0;padding:4px 0 0 16px;display:flex}.DBuyfa_phase{min-width:0}.DBuyfa_members{flex-direction:column;gap:2px;min-width:0;padding:0 0 0 16px;display:flex}.DBuyfa_memberRow,.DBuyfa_memberButton{width:100%;min-width:0;min-height:calc(24px + var(--dsh-content-font-delta,0px));border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;background:0 0;border:0;align-items:center;gap:12px;padding:0;display:flex}.DBuyfa_memberButton{cursor:pointer}.DBuyfa_memberButton .DBuyfa_memberLabel{color:var(--dsw-alias-link);font-weight:500;text-decoration:none}.DBuyfa_memberButton:hover .DBuyfa_memberLabel,.DBuyfa_memberButton:focus-visible .DBuyfa_memberLabel{text-underline-offset:3px;text-decoration:underline dotted}.DBuyfa_dotSlot{width:16px;height:calc(24px + var(--dsh-content-font-delta,0px));flex:none;justify-content:center;align-items:center;display:inline-flex;overflow:hidden}.DBuyfa_memberButton:focus-visible{outline:none}.DBuyfa_memberButton:focus-visible .DBuyfa_memberLabelWrap{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-1px}.DBuyfa_memberLabelWrap{min-width:0;height:calc(24px + var(--dsh-content-font-delta,0px));border-radius:var(--dsw-radius-sm);flex:1;align-items:center;padding:0 2px;display:flex;overflow:hidden}.DBuyfa_memberLabel{min-width:0;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size,14px);line-height:calc(24px + var(--dsh-content-font-delta,0px));text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.DBuyfa_memberStatus{width:64px;color:var(--dsw-alias-label-secondary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));text-align:right;text-overflow:ellipsis;white-space:nowrap;flex:none;overflow:hidden}.DBuyfa_empty{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));padding:0}@media (width<=560px){.DBuyfa_phaseList,.DBuyfa_members{padding-left:12px}}.DBuyfa_headerContent{flex:1}.DBuyfa_headerContentLayout{gap:6px}";
		const tagId = "trisoul_x/overview/dsh-client-ui-workflow-run/WorkflowRunPanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "trisoul_x";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var WorkflowRunPanel_module_css_default = {
			"dotSlot": "DBuyfa_dotSlot",
			"empty": "DBuyfa_empty",
			"headerContent": "DBuyfa_headerContent",
			"headerContentLayout": "DBuyfa_headerContentLayout",
			"memberButton": "DBuyfa_memberButton",
			"memberLabel": "DBuyfa_memberLabel",
			"memberLabelWrap": "DBuyfa_memberLabelWrap",
			"memberRow": "DBuyfa_memberRow",
			"memberStatus": "DBuyfa_memberStatus",
			"members": "DBuyfa_members",
			"phase": "DBuyfa_phase",
			"phaseCount": "DBuyfa_phaseCount",
			"phaseHeader": "DBuyfa_phaseHeader",
			"phaseLeading": "DBuyfa_phaseLeading",
			"phaseList": "DBuyfa_phaseList",
			"phaseStatus": "DBuyfa_phaseStatus",
			"phaseTitle": "DBuyfa_phaseTitle",
			"root": "DBuyfa_root",
			"runHeader": "DBuyfa_runHeader",
			"runLeading": "DBuyfa_runLeading",
			"runSummary": "DBuyfa_runSummary",
			"runTitle": "DBuyfa_runTitle",
			"separator": "DBuyfa_separator",
			"statusTail": "DBuyfa_statusTail"
		};
		//#endregion
		//#region lib/types/client/WorkflowRunPanel.js
		const STATUS_KEYS = {
			running: "status.running",
			completed: "status.completed",
			failed: "status.failed",
			cancelled: "status.cancelled",
			interrupted: "status.interrupted"
		};
		function dotState(status) {
			switch (status) {
				case "running": return "ongoing";
				case "completed": return "done";
				case "failed": return "error";
				case "cancelled":
				case "interrupted": return "warning";
				/* v8 ignore next -- WorkflowRunStatus is closed and every variant is handled above. */
				default: return status;
			}
		}
		function readablePhase(phase, t) {
			if (phase === null) return t("phase.unassigned");
			return phase === "" ? t("phase.empty") : phase;
		}
		function readableMember(label, t) {
			return label === "" ? t("member.empty") : label;
		}
		function statusCount(status, count, t) {
			return t(`statusCount.${status}`, { count });
		}
		function memberCount(count, t) {
			return t(count === 1 ? "run.members.one" : "run.members.other", { count });
		}
		function StatusDisclosure(props) {
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				...props,
				expandable: true
			});
		}
		function abnormal(status) {
			return status === "failed" || status === "cancelled" || status === "interrupted";
		}
		function phaseDisclosureFacts(phase) {
			return {
				mode: phase.members.some((member) => abnormal(member.status)) ? "abnormal" : phase.members.some((member) => member.status === "running") ? "running" : "clean",
				activityCount: phase.members.length
			};
		}
		function runDisclosureFacts(status, phases) {
			return {
				mode: abnormal(status) || phases.some(([, facts]) => facts.mode === "abnormal") ? "abnormal" : status === "running" || phases.some(([, facts]) => facts.mode === "running") ? "running" : "clean",
				activityCount: phases.reduce((count, [, facts]) => count + facts.activityCount, 0)
			};
		}
		function initialDisclosureState(facts) {
			return {
				...facts,
				open: facts.mode !== "clean",
				pendingCleanCollapse: false
			};
		}
		function advanceDisclosureState(current, facts, focusWithin) {
			if (current.mode === facts.mode && current.activityCount === facts.activityCount) {
				if (!current.pendingCleanCollapse || focusWithin) return current;
				return {
					...current,
					open: false,
					pendingCleanCollapse: false
				};
			}
			if (facts.mode === "clean") {
				const deferCollapse = current.open && focusWithin;
				return {
					...facts,
					open: deferCollapse,
					pendingCleanCollapse: deferCollapse
				};
			}
			if (current.mode === "clean" || facts.mode === "abnormal" && current.mode !== "abnormal") return {
				...facts,
				open: true,
				pendingCleanCollapse: false
			};
			return {
				...facts,
				open: current.open,
				pendingCleanCollapse: false
			};
		}
		function focusIsWithin(element) {
			if (element === null || element === void 0) return false;
			return element.contains(element.ownerDocument.activeElement);
		}
		function collapsePending(state) {
			if (!state.pendingCleanCollapse) return state;
			return {
				...state,
				open: false,
				pendingCleanCollapse: false
			};
		}
		function existingPhaseState(phases, key) {
			const phase = phases.get(key);
			/* v8 ignore next -- mounted phase callbacks are created from this owner map. */
			if (phase === void 0) throw new Error(`Missing disclosure state for phase ${key}`);
			return phase;
		}
		function preventPendingHeaderFocus(event) {
			const header = event.currentTarget.querySelector("[data-disclosure-row]");
			/* v8 ignore next -- DisclosureRow always renders its header before the content. */
			if (header === null) throw new Error("Missing disclosure header");
			if (header.contains(event.target)) event.preventDefault();
		}
		function phaseStatusSummary(members, t) {
			const counts = /* @__PURE__ */ new Map();
			for (const member of members) counts.set(member.status, (counts.get(member.status) ?? 0) + 1);
			const count = (status) => counts.get(status) ?? 0;
			const active = [
				"running",
				"failed",
				"cancelled",
				"interrupted"
			].filter((status) => count(status) > 0);
			if (active.length === 0) return statusCount("completed", count("completed"), t);
			return (active.includes("interrupted") && count("completed") > 0 ? ["completed", ...active] : active).map((status) => statusCount(status, count(status), t)).join(" · ");
		}
		function navigableMembers(sessions, phases, parentId) {
      const catalog = sessions.projectionsBySession[parentId]?.values.subagentCatalog ?? [];
      const result = new Map();
      for (const phase of phases) for (const member of phase.members) {
        const child = catalog.find(entry => entry.id === member.childId);
        if (child && child.mode !== 'external') result.set(member.childId, sessions.projectionsBySession[member.childId]?.values.subagent?.mode ?? child.mode);
      }
      return result;
    }
		function RunHeader({ children, count, name, onToggle, open, status, t }) {
			return (0, react_jsx_runtime.jsx)(StatusDisclosure, {
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {}),
				title: t("run.title", { name }),
				open,
				onToggle,
				expandOnRowClick: true,
				previewChevron: false,
				keepContentWhenOpen: true,
				rowClassName: WorkflowRunPanel_module_css_default.runHeader,
				contentClassName: WorkflowRunPanel_module_css_default.headerContent,
				contentLayoutClassName: WorkflowRunPanel_module_css_default.headerContentLayout,
				leadingClassName: WorkflowRunPanel_module_css_default.runLeading,
				titleClassName: WorkflowRunPanel_module_css_default.runTitle,
				collapsedContent: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					(0, react_jsx_runtime.jsx)("span", {
						className: WorkflowRunPanel_module_css_default.separator,
						"aria-hidden": true
					}),
					(0, react_jsx_runtime.jsx)("span", {
						className: WorkflowRunPanel_module_css_default.runSummary,
						children: memberCount(count, t)
					}),
					(0, react_jsx_runtime.jsxs)("span", {
						className: WorkflowRunPanel_module_css_default.statusTail,
						"data-status": status,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotState(status) }), (0, react_jsx_runtime.jsx)("span", { children: t(STATUS_KEYS[status]) })]
					})
				] }),
				children
			});
		}
		function MemberRow({ member, mode, openSession, parentSessionId, t }) {
const renderAvatar = react.useContext(OverviewAvatarContext);
			const navigable = mode !== void 0;
			const name = readableMember(member.label, t);
			const [focused, setFocused] = (0, react.useState)(false);
			const renderButton = navigable || focused;
			const content = (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.dotSlot,
					children: (renderAvatar?.(member.childId) ?? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: dotState(member.status) }))
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.memberLabelWrap,
					"data-member-label-wrap": true,
					children: (0, react_jsx_runtime.jsx)("span", {
						className: WorkflowRunPanel_module_css_default.memberLabel,
						"data-member-label": true,
						children: name
					})
				}),
				(0, react_jsx_runtime.jsx)("span", {
					className: WorkflowRunPanel_module_css_default.memberStatus,
					"data-member-status-text": true,
					children: t(STATUS_KEYS[member.status])
				})
			] });
			if (!renderButton) return (0, react_jsx_runtime.jsx)("div", {
				className: WorkflowRunPanel_module_css_default.memberRow,
				"data-member-status": member.status,
				children: content
			});
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: navigable ? WorkflowRunPanel_module_css_default.memberButton : WorkflowRunPanel_module_css_default.memberRow,
				"data-member-status": member.status,
				"aria-disabled": navigable ? void 0 : true,
				"aria-label": navigable ? t("member.open", { name }) : name,
				tabIndex: navigable ? void 0 : -1,
				onFocus: () => {
					setFocused(true);
				},
				onBlur: () => {
					setFocused(false);
				},
				onClick: mode !== void 0 ? () => {
					openSession({
						parentSessionId,
						childSessionId: member.childId,
						mode
					});
				} : void 0,
				children: content
			});
		}
		function PhaseSection({ contentRef, onContentBlur, onToggle, open, pendingCleanCollapse, phase, navigable, openSession, parentSessionId, t }) {
			return (0, react_jsx_runtime.jsx)("div", {
				className: WorkflowRunPanel_module_css_default.phase,
				onMouseDownCapture: pendingCleanCollapse ? preventPendingHeaderFocus : void 0,
				children: (0, react_jsx_runtime.jsx)(StatusDisclosure, {
					icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutlineRegular, {}),
					title: readablePhase(phase.phase, t),
					open,
					onToggle,
					expandOnRowClick: true,
					previewChevron: false,
					keepContentWhenOpen: true,
					rowClassName: WorkflowRunPanel_module_css_default.phaseHeader,
					contentClassName: WorkflowRunPanel_module_css_default.headerContent,
					contentLayoutClassName: WorkflowRunPanel_module_css_default.headerContentLayout,
					leadingClassName: WorkflowRunPanel_module_css_default.phaseLeading,
					titleClassName: WorkflowRunPanel_module_css_default.phaseTitle,
					collapsedContent: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.separator,
							"aria-hidden": true
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.phaseCount,
							"data-phase-count": true,
							children: memberCount(phase.members.length, t)
						}),
						(0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.phaseStatus,
							"data-phase-status-text": true,
							children: phaseStatusSummary(phase.members, t)
						})
					] }),
					children: (0, react_jsx_runtime.jsx)("div", {
						ref: contentRef,
						className: WorkflowRunPanel_module_css_default.members,
						onBlur: onContentBlur,
						children: phase.members.map((member) => (0, react_jsx_runtime.jsx)(MemberRow, {
							member,
							mode: navigable.get(member.childId),
							openSession,
							parentSessionId,
							t
						}, member.seq))
					})
				})
			});
		}
		/** Render one durable workflow run with status-driven run and phase disclosure. */
		function WorkflowRunPanel({ node, sessionId, useSessions, useSessionStatus, openSession, t }) {
			const phaseFacts = (0, react.useMemo)(() => node.data.phases.map((phase) => [phase.key, phaseDisclosureFacts(phase)]), [node.data.phases]);
			const runFacts = (0, react.useMemo)(() => runDisclosureFacts(node.data.status, phaseFacts), [node.data.status, phaseFacts]);
			const totalMembers = runFacts.activityCount;
			const [disclosures, setDisclosures] = (0, react.useState)(() => ({
				run: initialDisclosureState(runFacts),
				phases: new Map(phaseFacts.map(([key, facts]) => [key, initialDisclosureState(facts)]))
			}));
			const runContentRef = (0, react.useRef)(null);
			const phaseContentRefs = (0, react.useRef)(/* @__PURE__ */ new Map());
			const statuses = useSessionStatus((value) => value);
			const navigable = useSessions((sessions) => navigableMembers(sessions, node.data.phases, sessionId, statuses), _deepseek_ai_dsh_client_store.shallowEqual);
			(0, react.useLayoutEffect)(() => {
				setDisclosures((current) => {
					const phases = /* @__PURE__ */ new Map();
					let phasesChanged = current.phases.size !== phaseFacts.length;
					let phaseStartedCycle = false;
					for (const [key, facts] of phaseFacts) {
						const previous = current.phases.get(key);
						const next = previous === void 0 ? initialDisclosureState(facts) : advanceDisclosureState(previous, facts, focusIsWithin(phaseContentRefs.current.get(key)));
						phases.set(key, next);
						if (next !== previous) phasesChanged = true;
						if (previous?.mode === "clean" && (facts.mode !== "clean" || facts.activityCount !== previous.activityCount)) phaseStartedCycle = true;
					}
					const advancedRun = advanceDisclosureState(current.run, runFacts, focusIsWithin(runContentRef.current));
					const run = phaseStartedCycle && runFacts.mode !== "clean" && !advancedRun.open ? {
						...advancedRun,
						open: true,
						pendingCleanCollapse: false
					} : advancedRun;
					return run !== current.run || phasesChanged ? {
						run,
						phases
					} : current;
				});
			}, [
				disclosures.run.open,
				phaseFacts,
				runFacts
			]);
			const toggleRun = () => {
				setDisclosures((current) => ({
					...current,
					run: {
						...current.run,
						open: !current.run.open,
						pendingCleanCollapse: false
					}
				}));
			};
			const togglePhase = (key) => {
				setDisclosures((current) => {
					const phases = new Map(current.phases);
					const phase = existingPhaseState(phases, key);
					phases.set(key, {
						...phase,
						open: !phase.open,
						pendingCleanCollapse: false
					});
					return {
						...current,
						phases
					};
				});
			};
			const settleRunBlur = (event) => {
				if (event.currentTarget.contains(event.relatedTarget)) return;
				setDisclosures((current) => {
					const run = collapsePending(current.run);
					return run === current.run ? current : {
						...current,
						run
					};
				});
			};
			const settlePhaseBlur = (key, event) => {
				if (event.currentTarget.contains(event.relatedTarget)) return;
				setDisclosures((current) => {
					const phase = existingPhaseState(current.phases, key);
					const next = collapsePending(phase);
					if (next === phase) return current;
					const phases = new Map(current.phases);
					phases.set(key, next);
					return {
						...current,
						phases
					};
				});
			};
			return (0, react_jsx_runtime.jsx)("section", {
				className: WorkflowRunPanel_module_css_default.root,
				"data-workflow-run": true,
				"data-run-status": node.data.status,
				onMouseDownCapture: disclosures.run.pendingCleanCollapse ? preventPendingHeaderFocus : void 0,
				children: (0, react_jsx_runtime.jsx)(RunHeader, {
					count: totalMembers,
					name: node.data.name,
					open: disclosures.run.open,
					onToggle: toggleRun,
					status: node.data.status,
					t,
					children: (0, react_jsx_runtime.jsx)("div", {
						ref: runContentRef,
						className: WorkflowRunPanel_module_css_default.phaseList,
						onBlur: settleRunBlur,
						children: node.data.phases.length === 0 ? (0, react_jsx_runtime.jsx)("span", {
							className: WorkflowRunPanel_module_css_default.empty,
							children: t("run.empty")
						}) : node.data.phases.map((phase) => {
							const facts = phaseDisclosureFacts(phase);
							const disclosure = disclosures.phases.get(phase.key) ?? initialDisclosureState(facts);
							return (0, react_jsx_runtime.jsx)(PhaseSection, {
								contentRef: (element) => {
									if (element === null) phaseContentRefs.current.delete(phase.key);
									else phaseContentRefs.current.set(phase.key, element);
								},
								onContentBlur: (event) => {
									settlePhaseBlur(phase.key, event);
								},
								onToggle: () => {
									togglePhase(phase.key);
								},
								open: disclosure.open,
								pendingCleanCollapse: disclosure.pendingCleanCollapse,
								phase,
								navigable,
								openSession,
								parentSessionId: sessionId,
								t
							}, phase.key);
						})
					})
				})
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `workflowRun` namespace dictionaries. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "workflowRun";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"run.title": "{name}",
			"run.members.one": "{count} 个成员",
			"run.members.other": "{count} 个成员",
			"run.empty": "没有启动成员",
			"phase.unassigned": "未分阶段",
			"phase.empty": "空阶段名",
			"statusCount.running": "运行中 {count}",
			"statusCount.completed": "已完成 {count}",
			"statusCount.failed": "失败 {count}",
			"statusCount.cancelled": "已取消 {count}",
			"statusCount.interrupted": "已中断 {count}",
			"member.empty": "空成员名",
			"member.open": "打开 {name}",
			"status.running": "运行中",
			"status.completed": "已完成",
			"status.failed": "失败",
			"status.cancelled": "已取消",
			"status.interrupted": "已中断"
		};
		/** English dictionary (same key set). */
		const en = {
			"run.title": "{name}",
			"run.members.one": "{count} member",
			"run.members.other": "{count} members",
			"run.empty": "No members started",
			"phase.unassigned": "Unphased",
			"phase.empty": "Empty phase name",
			"statusCount.running": "Running {count}",
			"statusCount.completed": "Completed {count}",
			"statusCount.failed": "Failed {count}",
			"statusCount.cancelled": "Cancelled {count}",
			"statusCount.interrupted": "Interrupted {count}",
			"member.empty": "Empty member name",
			"member.open": "Open {name}",
			"status.running": "Running",
			"status.completed": "Completed",
			"status.failed": "Failed",
			"status.cancelled": "Cancelled",
			"status.interrupted": "Interrupted"
		};
		//#endregion
		//#region lib/types/client/workflow-definition.js
		/**
		* Build a collision-free phase key preserving absent versus empty identity.
		* @param phase - exact phase string, or null for an omitted field.
		* @returns the stable renderer key for that phase identity.
		*/
		function workflowPhaseKey(phase) {
			return phase === null ? "missing" : `value:${phase.length}:${phase}`;
		}
		function statusFromStopReason(stopReason) {
			switch (stopReason) {
				case "completed": return "completed";
				case "cancelled": return "cancelled";
				case "error": return "failed";
				/* v8 ignore next -- WorkflowStopReason is closed and every variant is handled above. */
				default: return stopReason;
			}
		}
		function statusFromOutcome(outcome) {
			switch (outcome) {
				case "completed": return "completed";
				case "cancelled": return "cancelled";
				case "failed": return "failed";
				/* v8 ignore next -- WorkflowAgentOutcome is closed and every variant is handled above. */
				default: return outcome;
			}
		}
		/**
		* A foreground run writes its run-end before its Tool Step ends, and a
		* background run outlives that Step, so an ordinary Step or Turn closure says
		* nothing about liveness. Only a Turn closed after a crash or at a fork
		* boundary proves that a run without run-end stopped.
		*/
		function turnAbandoned(location) {
			if (location.kind !== "step" && location.kind !== "turn") return false;
			const reason = location.turn.end?.data.reason.kind;
			return reason === "interrupted" || reason === "forked";
		}
		function projectWorkflow(context, location) {
			const state = context.state;
			const interrupted = state.stopReason === void 0 && turnAbandoned(location);
			const phases = /* @__PURE__ */ new Map();
			for (const member of state.members) {
				const phase = member.phase === void 0 ? null : member.phase;
				const key = workflowPhaseKey(phase);
				let group = phases.get(key);
				if (group === void 0) {
					group = {
						phase,
						members: []
					};
					phases.set(key, group);
				}
				group.members.push({
					seq: member.seq,
					label: member.label,
					childId: member.childId,
					status: member.outcome === void 0 ? interrupted ? "interrupted" : "running" : statusFromOutcome(member.outcome)
				});
			}
			const projectedPhases = [...phases].map(([key, phase]) => ({
				key,
				phase: phase.phase,
				members: phase.members
			}));
			return {
				name: state.name,
				status: state.stopReason === void 0 ? interrupted ? "interrupted" : "running" : statusFromStopReason(state.stopReason),
				phases: projectedPhases
			};
		}
		function updateAgentStart(state, data) {
			const member = {
				seq: data.seq,
				label: data.label,
				...data.phase === void 0 ? {} : { phase: data.phase },
				childId: data.childId
			};
			return {
				...state,
				members: [...state.members, member]
			};
		}
		function updateAgentEnd(state, data) {
			return {
				...state,
				members: state.members.map((member) => member.seq === data.seq ? {
					...member,
					outcome: data.outcome
				} : member)
			};
		}
		/** Durable workflow event family folded into one keyed Chat node. */
		const workflowRunDefinition = {
			kind: "workflow-run",
			target: "chat",
			match: (event) => {
				if (event.type === "tool-workflow/run-start") return {
					id: String(event.data.runId),
					role: "start"
				};
				if (event.type === "tool-workflow/agent-start" || event.type === "tool-workflow/agent-end" || event.type === "tool-workflow/run-end") return {
					id: String(event.data.runId),
					role: "update"
				};
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "tool-workflow/run-start") throw new Error("workflow-run start requires tool-workflow/run-start");
				return {
					name: match.event.data.name,
					members: []
				};
			},
			update: (context, match) => {
				if (match.event.type === "tool-workflow/agent-start") return updateAgentStart(context.state, match.event.data);
				if (match.event.type === "tool-workflow/agent-end") return updateAgentEnd(context.state, match.event.data);
				if (match.event.type === "tool-workflow/run-end") return {
					...context.state,
					stopReason: match.event.data.stopReason
				};
				return context.state;
			},
			buildViewNode: (context) => {
				if (context.start === void 0) return null;
				const data = projectWorkflow(context, context.start.location);
				return {
					key: context.key,
					kind: "workflow-run",
					id: context.id,
					target: "chat",
					anchorSeq: context.start.event.seq,
					location: context.start.location,
					visibility: "visible",
					data
				};
			}
		};
		//#endregion
		//#region lib/types/client/index.js
		/** Browser plugin for durable workflow-run Conversation Nodes. */
		/** Required services for Definition, keyed renderer, navigation, and copy. */
		const inject = [
			"uiConversation",
			"uiWorkspace",
			"slots",
			"sessions",
			"locale"
		];
		/** Register the workflow Definition, dictionary, and keyed Chat renderer. */
		function apply(ctx) {
			ctx.uiConversation.events.register(workflowRunDefinition);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-workflow-run: dictionaries");
			ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
				name: "conversation.chat.node",
				key: "workflow-run",
				locale: NS,
				inject: () => ({ openSession: (target) => {
					ctx.uiWorkspace.openSession(target);
				} })
			}, WorkflowRunPanel));
		}
		//#endregion
		const OverviewAvatarContext = react.createContext(null);
      exports.WorkflowPanel = function(props) { return react.createElement(OverviewAvatarContext.Provider, {value:props.renderAvatar}, react.createElement(WorkflowRunPanel, props)); };
exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});


return record.factory(require); }