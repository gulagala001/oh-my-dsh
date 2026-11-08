// @deepseek-ai/dsh-client-ui-open-in-app 0.2.2-rc.1; upstream SHA-256 461eefbd89bf448abce7215a2ec60355ed6cb06533833292fece150a8bde90f8
export function createOpenInApp(require) {
const registration = {
	id: "@deepseek-ai/dsh-client-ui-open-in-app",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region ../../util/workspace-path/src/file-address.ts
		/** The scheme and type every file address opens with. */
		const FILE_ADDRESS_PREFIX = "dsh-resource://file/";
		/** Component-encode one id or path segment, keeping `:` literal for drive letters. */
		function encodeSegment(segment) {
			return encodeURIComponent(segment).replace(/%3A/gi, ":");
		}
		/** Encode a `/`-separated path segment by segment. */
		function encodePath(path) {
			return path.split("/").map(encodeSegment).join("/");
		}
		/**
		* Build the address of a file read through one Session.
		* @param sessionId - the Session whose Host workspace resolves the path.
		* @param path - absolute or workspace-relative path; backslashes are normalized to `/`, and leading `./` prefixes are dropped.
		* @returns the `dsh-resource://file/session/<sessionId>/<path>` address.
		*/
		function sessionFileAddress(sessionId, path) {
			const normalized = path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
			return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${encodePath(normalized)}`;
		}
		//#endregion
		//#region ../../util/workspace-path/src/index.ts
		/**
		* Browser-safe Workspace path and display helpers.
		* @module @deepseek-ai/dsh-util-workspace-path
		*/
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Whether a path is absolute in either spelling the Host accepts: POSIX (`/a/b`) or Windows drive or UNC.
		* @param path - the path to classify.
		* @returns `true` for an absolute path; `false` for a Workspace-relative one.
		*/
		function isAbsoluteWorkspacePath(path) {
			return path.startsWith("/") || isWindowsStylePath(path);
		}
		/**
		* Resolve a Workspace-relative path into the Host-facing spelling used by path operations.
		* @param cwd - Session Workspace root, when known.
		* @param path - Absolute or Workspace-relative path; leading `./` segments are dropped when joining.
		* @returns an absolute path when a Workspace root is available, otherwise the original path.
		*/
		function resolveWorkspacePath(cwd, path) {
			if (isAbsoluteWorkspacePath(path)) return path;
			if (cwd === void 0 || cwd === "") return path;
			const separator = isWindowsStylePath(cwd) && cwd.includes("\\") ? "\\" : "/";
			return `${cwd.replace(/[/\\]+$/, "")}${separator}${path.replace(/^(?:\.?[/\\])+/, "")}`;
		}
		/**
		* The address for a path as a caller holds it: a relative path, or an absolute
		* path inside the Session's workspace, becomes a `session`-scoped address; an
		* absolute path outside it, or one whose workspace root is unknown, keeps its
		* absolute path in that Session's address.
		* @param sessionId - the Session the path is read in.
		* @param cwd - that Session's workspace root, when known.
		* @param path - absolute or workspace-relative path, in either separator spelling.
		* @returns the `dsh-resource://file/…` address.
		*/
		function fileAddressFor(sessionId, cwd, path) {
			const normalized = path.replace(/\\/g, "/");
			if (!isAbsoluteWorkspacePath(normalized)) return sessionFileAddress(sessionId, normalized);
			const root = cwd === void 0 ? "" : cwd.replace(/\\/g, "/").replace(/\/+$/, "");
			if (root !== "" && normalized === root) return sessionFileAddress(sessionId, "");
			if (root !== "" && normalized.startsWith(`${root}/`)) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
			return sessionFileAddress(sessionId, normalized);
		}
		//#endregion
		//#region lib/types/client/context-menus.js
		/** Native path and URL menu contributions, independent of their trigger components. */
		/**
		* Register native opening, original-path reveal, and URL actions.
		* @param ctx - declared plugin dependencies.
		* @param paths - existing native file actions.
		* @param t - localized action labels.
		* @param directories - installed directory applications.
		* @param report - native operation feedback shared with the application controls.
		*/
		function registerContextMenus(ctx, paths, t, directories, report) {
			const fileManager = () => t(directories.apps.getSnapshot()?.includes("finder") ? "menu.finder" : "menu.reveal");
			const open = async (path, action, application) => {
				report(await paths.openPath(path, action, application));
			};
			const resolvePath = async (sessionId, path, signal) => {
				try {
					const result = await ctx.remote.workspaceFiles.stat(sessionId, path, signal);
					return result.ok ? result.value.absolutePath : void 0;
				} catch (_error) {
					signal.throwIfAborted();
					return;
				}
			};
			ctx.effect(() => ctx.contextMenus.register({
				id: "open-in-app.workspace",
				target: "workspace",
				order: 200,
				resolve: async ({ path }, signal) => {
					await directories.load();
					signal.throwIfAborted();
					const manager = directories.apps.getSnapshot()?.find((id) => [
						"finder",
						"explorer",
						"filemanager"
					].includes(id));
					return [{
						id: "reveal",
						icon: { key: "open-in-app.reveal" },
						label: fileManager(),
						disabled: manager === void 0,
						failureLabel: t("path.revealError"),
						...manager === void 0 ? {} : { run: async () => {
							const outcome = await directories.launch(manager, path);
							report(outcome.kind === "failed" ? {
								kind: "failed",
								failure: "revealError"
							} : outcome);
						} }
					}];
				}
			}), "open-in-app: Workspace context menu");
			ctx.effect(() => ctx.contextMenus.register({
				id: "open-in-app.directory",
				target: "directory",
				order: 100,
				resolve: async ({ sessionId, path }, signal) => {
					await paths.load();
					const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
					const absolutePath = resolveWorkspacePath(cwd, path);
					signal.throwIfAborted();
					return [{
						id: "reveal",
						icon: { key: "open-in-app.reveal" },
						label: fileManager(),
						disabled: paths.desktop.getSnapshot() !== true,
						run: () => open(absolutePath, "reveal")
					}, {
						id: "copyPath",
						icon: { key: "open-in-app.copy" },
						label: t("menu.copyDirectoryPath"),
						failureLabel: t("menu.copyFailed"),
						run: async () => {
							await navigator.clipboard.writeText(absolutePath);
							ctx.contextMenus.notify(t("menu.copied"), true);
						}
					}];
				}
			}), "open-in-app: directory context menu");
			ctx.effect(() => ctx.contextMenus.register({
				id: "open-in-app.file",
				target: "file",
				order: 100,
				resolve: async (target, signal) => {
					const { sessionId, path, line } = target;
					await paths.load();
					const absolutePath = await resolvePath(sessionId, path, signal);
					const available = absolutePath !== void 0;
					const desktop = paths.desktop.getSnapshot() === true && available;
					const apps = desktop ? await paths.applications(absolutePath, signal) : [];
					signal.throwIfAborted();
					const application = apps?.find((app) => app.default);
					const openIn = (destination) => () => {
						const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
						ctx.sidebarRight.openResourceIn(sessionId, fileAddressFor(sessionId, cwd, path), {
							destination,
							...line === void 0 ? {} : { params: { line } }
						});
					};
					return [
						{
							id: "sidebar",
							icon: { key: "open-in-app.sidebar" },
							label: t("menu.openInSidebar"),
							disabled: !available,
							run: openIn("sidebar")
						},
						{
							id: "float",
							icon: { key: "open-in-app.float" },
							label: t("menu.openInFloat"),
							disabled: !available,
							run: openIn("float")
						},
						{
							id: "reveal",
							icon: { key: "open-in-app.reveal" },
							label: fileManager(),
							disabled: !desktop,
							...absolutePath === void 0 ? {} : { run: () => open(absolutePath, "reveal") }
						},
						{
							id: "open",
							label: application ? t("open.title", { app: application.name }) : t("menu.defaultApp"),
							icon: {
								key: "open-in-app.application",
								...application?.icon ? { src: application.icon } : {}
							},
							disabled: application === void 0,
							...absolutePath === void 0 || application === void 0 ? {} : { run: () => open(absolutePath, "open", application.id) }
						},
						{
							id: "copyPath",
							icon: { key: "open-in-app.copy" },
							failureLabel: t("menu.copyFailed"),
							label: t("menu.copyPath"),
							run: async () => {
								const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
								await navigator.clipboard.writeText(absolutePath ?? resolveWorkspacePath(cwd, path));
								ctx.contextMenus.notify(t("menu.copied"), true);
							}
						}
					];
				}
			}), "open-in-app: file context menu");
			ctx.effect(() => ctx.contextMenus.register({
				id: "open-in-app.url",
				target: "url",
				order: 100,
				resolve: ({ sessionId, url }) => [
					{
						id: "sidebar",
						icon: { key: "open-in-app.sidebar" },
						label: t("menu.openInSidebar"),
						disabled: ctx.sidebarRightTabs.get("browser") === void 0,
						run: () => {
							ctx.sidebarRight.openTabIn(sessionId, "browser", { params: { url } });
						}
					},
					{
						id: "external",
						label: t("menu.external"),
						run: () => {
							window.open(url, "_blank", "noopener,noreferrer");
						}
					},
					{
						id: "copy",
						icon: { key: "open-in-app.copy" },
						failureLabel: t("menu.copyFailed"),
						label: t("menu.copyLink"),
						run: async () => {
							await navigator.clipboard.writeText(url);
							ctx.contextMenus.notify(t("menu.copied"), true);
						}
					}
				]
			}), "open-in-app: URL context menu");
			ctx.effect(() => ctx.contextMenus.register({
				id: "open-in-app.image",
				target: "image",
				order: 200,
				resolve: async (target, signal) => {
					const { sessionId, path } = target;
					await paths.load();
					const local = path !== void 0 && sessionId !== void 0 && paths.desktop.getSnapshot() === true ? await resolvePath(sessionId, path, signal) : void 0;
					signal.throwIfAborted();
					return [{
						id: "reveal",
						icon: { key: "open-in-app.reveal" },
						label: fileManager(),
						disabled: local === void 0,
						...local !== void 0 ? { run: () => open(local, "reveal") } : {}
					}];
				}
			}), "open-in-app: image context menu");
		}
		/** @param props - icon metadata captured with the resolved action. @returns Application image or the native-open glyph. */
		function ContextMenuApplicationIcon({ icon }) {
			return icon.src ? (0, react_jsx_runtime.jsx)("img", {
				src: icon.src,
				width: 14,
				height: 14,
				alt: ""
			}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutlineRegular, {});
		}
		/** Browser-relative form of {@link OPEN_IN_APP_APPS_PATH}. */
		const OPEN_IN_APP_APPS_ROUTE = "/open-in-app/apps".slice(1);
		/** Browser-relative form of {@link OPEN_IN_APP_ICON_PREFIX_PATH}. */
		const OPEN_IN_APP_ICON_PREFIX_ROUTE = "/open-in-app/icon".slice(1);
		/** Browser-relative form of {@link OPEN_IN_APP_OPEN_PATH}. */
		const OPEN_IN_APP_OPEN_ROUTE = "/open-in-app/open".slice(1);
		//#endregion
		//#region lib/types/client/applications.js
		/** Label keys for applications supported by this client. */
		const APP_LABEL_KEY = {
			finder: "app.finder",
			explorer: "app.explorer",
			filemanager: "app.filemanager",
			cursor: "app.cursor",
			vscode: "app.vscode",
			vscodeinsiders: "app.vscodeinsiders",
			windsurf: "app.windsurf",
			zed: "app.zed",
			sublimetext: "app.sublimetext",
			xcode: "app.xcode",
			androidstudio: "app.androidstudio",
			intellij: "app.intellij",
			pycharm: "app.pycharm",
			webstorm: "app.webstorm",
			phpstorm: "app.phpstorm",
			goland: "app.goland",
			rider: "app.rider",
			rustrover: "app.rustrover",
			fork: "app.fork",
			sourcetree: "app.sourcetree",
			github: "app.github",
			tower: "app.tower",
			gitkraken: "app.gitkraken",
			smartgit: "app.smartgit",
			sublimemerge: "app.sublimemerge",
			ghostty: "app.ghostty",
			warp: "app.warp",
			iterm: "app.iterm",
			kitty: "app.kitty",
			terminal: "app.terminal",
			windowsterminal: "app.windowsterminal",
			gitbash: "app.gitbash",
			gnometerminal: "app.gnometerminal",
			konsole: "app.konsole"
		};
		//#endregion
		//#region lib/types/client/controller.js
		/** Browser availability/choice state and the launch carrier for the split button. */
		/**
		* Owns the once-per-page availability read, the persisted last choice, and
		* the launch POST. Availability and choice publish through uSES-safe sources
		* so every Session header shares one truth.
		*/
		var OpenInAppController = class {
			fetcher;
			/** Installed app ids in host menu order; null until the host answered. */
			apps = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(null);
			/** Last chosen app id, or empty before the first choice, shared across sessions and browser restarts. */
			choice = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)("", { persist: { name: "dsh.open-in-app.choice" } });
			/** Current launch, shared by pointer and keyboard gestures. */
			operation = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
				phase: "idle",
				path: null
			});
			/**
			* Resolve the remembered nameable installed application, with the button's first-app fallback.
			* @returns the installed app id, or undefined while unavailable.
			*/
			currentApp() {
				const apps = (this.apps.getSnapshot() ?? []).filter((id) => APP_LABEL_KEY[id] !== void 0);
				const choice = this.choice.getSnapshot();
				return apps.includes(choice) ? choice : apps[0];
			}
			loading;
			/**
			* @param fetcher - HTTP carrier for the apps read and the launch POST.
			*/
			constructor(fetcher = (input, init) => fetch(input, init)) {
				this.fetcher = fetcher;
			}
			/**
			* Read availability once per controller life; concurrent calls share the read.
			* A failed read publishes an empty list, which renders no button at all.
			* @returns after availability is published.
			*/
			load() {
				this.loading ??= this.run();
				return this.loading;
			}
			/**
			* Remember one picked app id.
			* @param appId - catalog id from the availability list.
			*/
			choose(appId) {
				if (this.operation.getSnapshot().phase !== "busy") this.choice.set(appId);
			}
			/**
			* Launch one installed app on a workspace directory.
			* @param appId - catalog id from the availability list.
			* @param path - the session's absolute workspace directory.
			* Concurrent gestures are ignored until the current Host request settles.
			* @returns the acknowledged handoff, or `{ kind: 'skipped' }` while another
			* launch holds the operation, or a named failure when the Host refuses or
			* cannot be reached. Host and transport failures resolve without rejecting.
			*/
			async launch(appId, path) {
				if (this.operation.getSnapshot().phase === "busy") return { kind: "skipped" };
				this.operation.set({
					phase: "busy",
					path
				});
				const body = {
					app: appId,
					path
				};
				try {
					const response = await this.fetcher(OPEN_IN_APP_OPEN_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body)
					});
					if (!response.ok) throw new Error(`open failed: HTTP ${String(response.status)}`);
					this.operation.set({
						phase: "idle",
						path
					});
					return { kind: "opened" };
				} catch (_error) {
					this.operation.set({
						phase: "error",
						path
					});
					return {
						kind: "failed",
						failure: "openError"
					};
				}
			}
			async run() {
				let apps = [];
				try {
					const response = await this.fetcher(OPEN_IN_APP_APPS_ROUTE, { headers: { accept: "application/json" } });
					if (response.ok) {
						const payload = await response.json();
						if (Array.isArray(payload.apps)) apps = payload.apps.filter((id) => typeof id === "string");
					}
				} catch {}
				this.apps.set(apps);
			}
		};
		//#endregion
		//#region lib/types/client/session-reveal.js
		/**
		* Share directory availability and launch feedback with the existing application controls.
		* @param ctx - owning plugin context.
		* @param controller - directory application catalog and launcher.
		* @param t - localized action and failure labels.
		* @param report - native operation feedback shared with the application controls.
		*/
		function registerSessionReveal(ctx, controller, t, report) {
			ctx.effect(() => ctx.contextMenus.register({
				id: "open-in-app.reveal",
				target: "session",
				order: 500,
				observe: () => [
					controller.apps,
					ctx.sessions.list,
					ctx.locale
				],
				resolve: ({ sessionId }) => {
					const directory = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
					const applications = controller.apps.getSnapshot();
					const manager = applications?.find((id) => [
						"finder",
						"explorer",
						"filemanager"
					].includes(id));
					return [{
						id: "reveal",
						label: t(applications?.includes("finder") ? "menu.finder" : "menu.reveal"),
						icon: { key: "open-in-app.reveal" },
						disabled: !directory || manager === void 0,
						failureLabel: t("path.revealError"),
						...directory && manager !== void 0 ? { run: async () => {
							const outcome = await controller.launch(manager, directory);
							report(outcome.kind === "failed" ? {
								kind: "failed",
								failure: "revealError"
							} : outcome);
						} } : {}
					}];
				}
			}), "open-in-app: Session directory menu");
		}
		//#endregion
		//#region \0dsh-css:/home/runner/work/deepseek-harness/deepseek-harness/packages/client/ui-open-in-app/src/client/OpenTargetButton.module.css.mjs
		const css = ".OMoRSG_menuAnchor{flex:none;align-self:center;display:inline-flex}.OMoRSG_split{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);height:24px;font-family:var(--dsw-font-family);align-items:stretch;display:inline-flex;overflow:hidden}.OMoRSG_main,.OMoRSG_chevron{color:var(--dsw-alias-label-primary);white-space:nowrap;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;font-size:11px;line-height:16px;display:inline-flex}.OMoRSG_main{gap:4px;padding:3px 5px}.OMoRSG_chevron{border-left:.5px solid var(--dsw-alias-border-l4);color:var(--dsw-alias-label-secondary);padding:3px 4px 3px 3px}.OMoRSG_main:focus-visible,.OMoRSG_chevron:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}@media (hover:hover){.OMoRSG_main:hover:not(:disabled),.OMoRSG_chevron:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}.OMoRSG_main:disabled,.OMoRSG_chevron:disabled{cursor:default}.OMoRSG_appIcon{object-fit:contain}.OMoRSG_split[data-size=large]{border-radius:var(--dsw-radius-md);border-color:var(--dsw-alias-border-l2);height:36px}.OMoRSG_split[data-size=large] .OMoRSG_main{gap:6px;padding:6px 14px;font-size:14px}.OMoRSG_split[data-size=large] .OMoRSG_chevron{padding:6px 10px}.OMoRSG_skeleton{border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-interactive-bg-hover);flex:none;display:inline-block}";
		const tagId = "@deepseek-ai/dsh-client-ui-open-in-app/OpenTargetButton.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-open-in-app";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var OpenTargetButton_module_css_default = {
			"appIcon": "OMoRSG_appIcon",
			"chevron": "OMoRSG_chevron",
			"main": "OMoRSG_main",
			"menuAnchor": "OMoRSG_menuAnchor",
			"skeleton": "OMoRSG_skeleton",
			"split": "OMoRSG_split"
		};
		//#endregion
		//#region lib/types/client/OpenTargetButton.js
		/** Shared file and directory opener: one default action, application menu, and one reported outcome per gesture. */
		/**
		* Serialize gestures and report the outcome each one settles on to the app-wide
		* announcer, which outlives this control and the panel holding it.
		* @param execute - target adapter that settles on the gesture's outcome.
		* @param report - announcement seat the settled outcome is sent to.
		* @returns the pending state and the guarded action callback.
		*/
		function useOpenTargetGesture(execute, report) {
			const [pending, setPending] = (0, react.useState)(false);
			const inFlight = (0, react.useRef)(false);
			return {
				pending,
				act: (operation) => {
					if (inFlight.current) return;
					inFlight.current = true;
					setPending(true);
					execute(operation).then(report).finally(() => {
						inFlight.current = false;
						setPending(false);
					});
				}
			};
		}
		/** One application image with a per-image fallback, shared by main and menu buttons. */
		function ApplicationIcon({ source, size = 14 }) {
			const [failed, setFailed] = (0, react.useState)(false);
			return source === null || failed ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutlineRegular, { size }) : (0, react_jsx_runtime.jsx)("img", {
				src: source,
				width: size,
				height: size,
				className: OpenTargetButton_module_css_default.appIcon,
				alt: "",
				draggable: false,
				onError: () => {
					setFailed(true);
				}
			});
		}
		/**
		* Render identical split buttons for files and directories. File reveal always
		* stays last; it is the default only when no application is registered.
		* @param props - target applications, default selection, and operations.
		* @returns the control alone: its settled outcomes are announced by the seat it reports to.
		*/
		function OpenTargetButton(props) {
			const { applications, defaultId, kind, t } = props;
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const { pending, act } = useOpenTargetGesture(props.execute, props.report);
			const preferred = kind === "file" ? applications.find((app) => app.id === defaultId) ?? applications[0] : applications.find((app) => app.id === defaultId);
			const disabled = pending || props.busy === true || props.loading === true;
			const hasMenu = props.loading === true || props.failed || applications.length + (kind === "file" ? 1 : 0) > 1;
			const revealDefault = kind === "file" && preferred === void 0 && props.loading !== true;
			const primaryLabel = preferred === void 0 ? t("path.reveal") : t("open.title", { app: preferred.name });
			const run = (operation) => {
				setMenuOpen(false);
				act(operation);
			};
			const primary = () => {
				if (revealDefault) {
					run({ kind: "reveal" });
					return;
				}
				if (preferred !== void 0 && preferred.id !== defaultId) {
					run({
						kind: "application",
						id: preferred.id
					});
					return;
				}
				run({ kind: "default" });
			};
			const icon = props.loading === true && preferred === void 0 ? (0, react_jsx_runtime.jsx)("span", {
				className: OpenTargetButton_module_css_default.skeleton,
				"data-open-target-skeleton": true,
				"aria-hidden": "true",
				style: {
					width: props.prominent ? 18 : 13,
					height: props.prominent ? 18 : 13
				}
			}) : revealDefault ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutlineRegular, { size: props.prominent ? 18 : 13 }) : (0, react_jsx_runtime.jsx)(ApplicationIcon, {
				source: preferred?.icon ?? null,
				size: props.prominent ? 18 : 13
			}, preferred?.icon);
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				className: OpenTargetButton_module_css_default.menuAnchor,
				open: menuOpen && !disabled && hasMenu,
				autoFocus: true,
				portal: true,
				dense: true,
				align: "end",
				onClose: () => {
					setMenuOpen(false);
				},
				items: [...applications.map((app) => ({
					id: `app:${app.id}`,
					icon: (0, react_jsx_runtime.jsx)(ApplicationIcon, { source: app.icon }, app.icon),
					label: app.id === preferred?.id ? t("path.appDefault", { app: app.name }) : app.name
				})), ...props.failed ? [{
					id: "unavailable",
					label: t("path.appsError"),
					disabled: true
				}] : []],
				footer: kind === "file" ? [{
					id: "reveal",
					icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutlineRegular, {}),
					label: revealDefault ? t("path.appDefault", { app: t("path.reveal") }) : t("path.reveal")
				}] : [],
				onSelect: (id) => {
					run(id === "reveal" ? { kind: "reveal" } : {
						kind: "application",
						id: id.slice(4)
					});
				},
				anchor: (0, react_jsx_runtime.jsxs)("div", {
					className: OpenTargetButton_module_css_default.split,
					"data-open-target": kind,
					"data-size": props.prominent ? "large" : "compact",
					"data-open-path": kind === "file" && !props.prominent ? "" : void 0,
					"data-state": disabled ? "busy" : "idle",
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						portal: true,
						label: primaryLabel,
						shortcutKeys: props.shortcut?.keys,
						side: "bottom",
						delayMs: 500,
						children: (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: OpenTargetButton_module_css_default.main,
							disabled,
							"aria-label": props.prominent ? void 0 : primaryLabel,
							"aria-keyshortcuts": props.shortcut?.aria,
							"data-open-path-open": kind === "file" && !props.prominent ? "" : void 0,
							"data-open-path-unpreviewable": props.prominent ? "" : void 0,
							onClick: primary,
							children: [icon, props.prominent && (revealDefault ? t("path.reveal") : t("path.open"))]
						})
					}), hasMenu && (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: OpenTargetButton_module_css_default.chevron,
						disabled,
						"aria-haspopup": "menu",
						"aria-expanded": menuOpen && !disabled,
						"aria-label": t("path.more"),
						"data-open-path-more": kind === "file" && !props.prominent ? "" : void 0,
						onClick: () => {
							if (!menuOpen) props.refresh?.();
							setMenuOpen((value) => !value);
						},
						children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: props.prominent ? 14 : 10 })
					})]
				})
			});
		}
		//#endregion
		//#region lib/types/client/OpenInAppAction.js
		/**
		* Adapt the installed directory catalog to the shared opening control.
		* @param props - displayed directory, installed catalog, launch operations, and the announcement seat.
		* @returns the shared control, or null without an eligible application.
		*/
		function OpenInAppAction(props) {
			const { absolutePath, useOpenInAppApps, useOpenInAppChoice, t } = props;
			const available = useOpenInAppApps((apps) => apps);
			const choice = useOpenInAppChoice((id) => id);
			const operation = props.useOpenInAppLaunch((value) => value);
			const shortcut = props.useShortcuts((rows) => rows.find((row) => row.id === "workspace.openLocal"));
			const apps = (available ?? []).flatMap((id) => {
				const key = APP_LABEL_KEY[id];
				return key === void 0 ? [] : [{
					id,
					name: t(key),
					icon: props.iconUrl(id)
				}];
			});
			const preferred = apps.find((app) => app.id === choice) ?? apps[0];
			if (preferred === void 0) return null;
			return (0, react_jsx_runtime.jsx)(OpenTargetButton, {
				kind: "directory",
				applications: apps,
				defaultId: preferred.id,
				failed: false,
				t,
				busy: operation.phase === "busy",
				shortcut,
				report: props.report,
				execute: async (operation) => {
					const id = operation.kind === "application" ? operation.id : preferred.id;
					const outcome = await props.launch(id, absolutePath);
					if (outcome.kind === "opened" && operation.kind === "application") props.choose(id);
					return outcome;
				}
			}, absolutePath);
		}
		//#endregion
		//#region lib/types/client/open-path.js
		/**
		* Host desktop availability, file associations, and open/reveal actions over the Session Remote.
		* The desktop answer is read once per page; a failed read renders no control.
		*/
		/** Page-lifetime desktop availability and the open/reveal carrier shared by every path control. */
		var OpenInAppPathController = class {
			remote;
			/** Whether the Host desktop can open paths; null until the Host answered, false also after a failed read. */
			desktop = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(null);
			loading;
			/**
			* @param remote - the Session Remote namespace answering availability and running gestures.
			*/
			constructor(remote) {
				this.remote = remote;
			}
			/**
			* Read desktop availability once per controller life; concurrent calls share the read.
			* @returns after availability is published.
			*/
			load() {
				this.loading ??= this.run();
				return this.loading;
			}
			/**
			* Open one Host path in its default application, or reveal it in the file manager.
			* @param path - absolute path on the Host, as the file's metadata reports it.
			* @param action - default application open, or file-manager reveal.
			* @param application - registered application path for an explicit open.
			* @returns the acknowledged open or reveal, or the named failure to announce.
			*/
			async openPath(path, action, application) {
				const request = action === "reveal" ? {
					path,
					action
				} : {
					path,
					...application === void 0 ? {} : { application }
				};
				let ok = false;
				try {
					ok = (await this.remote.session.openWorkspacePath(request)).ok;
				} catch {}
				if (ok) return { kind: action === "reveal" ? "revealed" : "opened" };
				return {
					kind: "failed",
					failure: action === "open" ? "openError" : "revealError"
				};
			}
			/**
			* Refresh the file's OS associations; failures remain distinct from an empty handler list.
			* @param path - file path reported by the Host.
			* @param signal - lifetime of the requesting preview.
			* @returns application metadata, or null when the query fails.
			*/
			async applications(path, signal) {
				let result;
				try {
					result = await this.remote.session.workspacePathApplications({ path }, signal);
				} catch (_error) {
					return null;
				}
				return result.ok ? result.value : null;
			}
			async run() {
				let available = false;
				try {
					const result = await this.remote.session.canOpenWorkspacePath();
					available = result.ok && result.value;
				} catch {}
				this.desktop.set(available);
			}
		};
		//#endregion
		//#region lib/types/client/file-applications.js
		/** File association reads shared by mounted controls using the same reader and target. */
		const EMPTY = {
			apps: [],
			loading: true,
			failed: false
		};
		const readers = /* @__PURE__ */ new WeakMap();
		/** Each mounted consumer retains the query; the last release cancels and discards it. */
		function subscribe(query, target, listener) {
			let targets = readers.get(query);
			if (targets === void 0) {
				targets = /* @__PURE__ */ new Map();
				readers.set(query, targets);
			}
			let entry = targets.get(target);
			const initial = entry === void 0;
			if (entry === void 0) {
				const created = {
					state: (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(EMPTY),
					users: 0,
					controller: null,
					refresh: () => {
						created.controller?.abort();
						const controller = new AbortController();
						created.controller = controller;
						query(target, controller.signal).then((apps) => {
							if (!controller.signal.aborted) created.state.set({
								apps: apps ?? [],
								loading: false,
								failed: apps === null
							});
						});
					}
				};
				entry = created;
				targets.set(target, entry);
			}
			const retained = entry;
			retained.users += 1;
			const release = retained.state.subscribe(listener);
			if (initial) retained.refresh();
			return () => {
				release();
				retained.users -= 1;
				if (retained.users === 0) {
					retained.controller?.abort();
					targets.delete(target);
				}
			};
		}
		/**
		* Share associations and refreshes across mounted controls for the same file and reader.
		* @param target - path or authenticated route identifying the current file.
		* @param query - stable reader scoped to the serving Host; failures resolve to null.
		* @param enabled - whether a native desktop is available.
		* @returns metadata, initial loading state, failure state, and a shared refresh callback.
		*/
		function useFileApplications(target, query, enabled) {
			const retain = (0, react.useCallback)((listener) => enabled ? subscribe(query, target, listener) : () => {}, [
				enabled,
				query,
				target
			]);
			const snapshot = (0, react.useCallback)(() => enabled ? readers.get(query)?.get(target)?.state.getSnapshot() ?? EMPTY : EMPTY, [
				enabled,
				query,
				target
			]);
			const state = (0, react.useSyncExternalStore)(retain, snapshot, snapshot);
			const refresh = (0, react.useCallback)(() => {
				readers.get(query)?.get(target)?.refresh();
			}, [query, target]);
			return {
				...state,
				refresh
			};
		}
		//#endregion
		//#region lib/types/client/OpenPathAction.js
		/** File association adapter for the shared file/directory opening control. */
		/**
		* Resolve file associations and adapt operations without embedding platform behavior in the control.
		* @param props - verified file path, desktop query, native operations, and display variant.
		* @returns the shared opening control, or null without a desktop.
		*/
		function FileOpenTarget(props) {
			const desktop = props.useOpenInAppDesktop((value) => value);
			const association = useFileApplications(props.absolutePath, props.applications, desktop === true);
			(0, react.useEffect)(() => {
				if (desktop === null) props.loadDesktop();
			}, [desktop, props.loadDesktop]);
			if (desktop !== true) return null;
			const { apps } = association;
			return (0, react_jsx_runtime.jsx)(OpenTargetButton, {
				kind: "file",
				applications: apps,
				defaultId: apps.find((app) => app.default)?.id,
				loading: association.loading,
				failed: association.failed,
				prominent: props.empty === true,
				t: props.t,
				refresh: association.refresh,
				report: props.report,
				execute: (operation) => props.openPath(props.absolutePath, operation.kind === "reveal" ? "reveal" : "open", operation.kind === "application" ? operation.id : void 0)
			}, props.absolutePath);
		}
		/**
		* Render the file adapter in the document header.
		* @param props - document owner inputs and injected opening capabilities.
		* @returns the shared split button.
		*/
		function OpenPathAction(props) {
			return (0, react_jsx_runtime.jsx)(FileOpenTarget, { ...props });
		}
		//#endregion
		//#region ../../util/native-command/src/types.ts
		/**
		* Validate file association metadata received from a native process or authenticated Host.
		* @param value - decoded application list.
		* @returns validated application metadata.
		* @throws Error for malformed entries or unsupported icon URLs.
		*/
		function parseNativeFileApplications(value) {
			if (!Array.isArray(value)) throw new Error("Invalid native application list");
			const applications = [];
			const entries = value;
			for (const entry of entries) {
				if (typeof entry !== "object" || entry === null || !("id" in entry) || !("name" in entry) || !("default" in entry) || !("icon" in entry) || typeof entry.id !== "string" || entry.id.length === 0 || typeof entry.name !== "string" || typeof entry.default !== "boolean" || !(entry.icon === null || typeof entry.icon === "string" && /^data:image\/(?:png|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(entry.icon))) throw new Error("Invalid native application entry");
				applications.push({
					id: entry.id,
					name: entry.name,
					default: entry.default,
					icon: entry.icon
				});
			}
			return applications;
		}
		//#endregion
		//#region lib/types/client/FileRouteAction.js
		async function queryRoute(url, signal) {
			try {
				const response = await fetch(url, { signal });
				if (!response.ok) return null;
				return parseNativeFileApplications(await response.json());
			} catch (_error) {
				return null;
			}
		}
		/**
		* Render file actions without bypassing the owning Session's authorization route.
		* @param props - authenticated route, desktop availability, the native gesture
		* callback, and the announcement seat its settled outcome is reported to.
		* @returns the shared compact control, or null without a desktop.
		*/
		function FileRouteAction(props) {
			const association = useFileApplications(props.actionUrl, queryRoute, props.available);
			if (!props.available) return null;
			return (0, react_jsx_runtime.jsx)(OpenTargetButton, {
				kind: "file",
				applications: association.apps,
				defaultId: association.apps.find((app) => app.default)?.id,
				failed: association.failed,
				loading: association.loading,
				busy: props.pending,
				refresh: association.refresh,
				t: props.t,
				report: props.report,
				execute: (operation) => props.onAction(operation.kind === "reveal" ? "reveal" : "open", operation.kind === "application" ? operation.id : void 0)
			}, props.actionUrl);
		}
		//#endregion
		//#region lib/types/client/OpenPathEmptyAction.js
		/**
		* Render the shared file opening menu with a larger labeled main button.
		* @param props - unpreviewable file and injected opening capabilities.
		* @returns the shared file opening action.
		*/
		function OpenPathEmptyAction(props) {
			return (0, react_jsx_runtime.jsx)(FileOpenTarget, {
				...props,
				empty: true
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** `open-in-app` namespace dictionaries: the workspace split button and the document-preview path controls. */
		/** Dictionary namespace owned by this plugin. */
		const NS = "open-in-app";
		/** Application labels shared verbatim by both dictionaries (product names). */
		const PRODUCT_NAMES = {
			"app.cursor": "Cursor",
			"app.vscode": "VS Code",
			"app.vscodeinsiders": "VS Code Insiders",
			"app.windsurf": "Windsurf",
			"app.zed": "Zed",
			"app.sublimetext": "Sublime Text",
			"app.xcode": "Xcode",
			"app.androidstudio": "Android Studio",
			"app.intellij": "IntelliJ IDEA",
			"app.pycharm": "PyCharm",
			"app.webstorm": "WebStorm",
			"app.phpstorm": "PhpStorm",
			"app.goland": "GoLand",
			"app.rider": "Rider",
			"app.rustrover": "RustRover",
			"app.fork": "Fork",
			"app.sourcetree": "Sourcetree",
			"app.github": "GitHub Desktop",
			"app.tower": "Tower",
			"app.gitkraken": "GitKraken",
			"app.smartgit": "SmartGit",
			"app.sublimemerge": "Sublime Merge",
			"app.ghostty": "Ghostty",
			"app.warp": "Warp",
			"app.iterm": "iTerm2",
			"app.kitty": "kitty",
			"app.windowsterminal": "Windows Terminal",
			"app.gitbash": "Git Bash",
			"app.gnometerminal": "GNOME Terminal",
			"app.konsole": "Konsole"
		};
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"menu.openInSidebar": "在侧边栏打开",
			"menu.openInFloat": "在浮窗中打开",
			"menu.finder": "在 Finder 中显示",
			"menu.reveal": "在文件夹显示",
			"menu.defaultApp": "使用默认应用打开",
			"menu.external": "外部浏览器打开",
			"menu.copyLink": "复制链接地址",
			"menu.copyPath": "复制文件路径",
			"menu.copyDirectoryPath": "复制文件夹路径",
			"menu.copied": "已复制",
			"menu.copyFailed": "无法复制，请检查内容是否可用后重试",
			"open.title": "用 {app} 打开",
			"path.appDefault": "{app}（默认）",
			"path.appsError": "无法获取应用列表",
			"shortcut.busy": "正在打开工作区",
			"shortcut.unavailable": "当前工作区或本地应用不可用",
			"open.tooltip": "在本地打开",
			"path.open": "打开",
			"path.more": "更多打开方式",
			"path.reveal": "显示文件位置",
			"path.opened": "已在其它设备打开",
			"path.revealed": "已在其它设备显示文件位置",
			"path.openError": "打开失败，请重试",
			"path.revealError": "无法显示文件位置，请重试",
			...PRODUCT_NAMES,
			"app.finder": "访达",
			"app.explorer": "文件资源管理器",
			"app.filemanager": "文件管理器",
			"app.terminal": "终端"
		};
		/** English dictionary, key-identical to the Chinese source of truth. */
		const en = {
			"menu.openInSidebar": "Open in sidebar",
			"menu.openInFloat": "Open in floating panel",
			"menu.finder": "Show in Finder",
			"menu.reveal": "Show in folder",
			"menu.defaultApp": "Open in default application",
			"menu.external": "Open in external browser",
			"menu.copyLink": "Copy link address",
			"menu.copyPath": "Copy file path",
			"menu.copyDirectoryPath": "Copy folder path",
			"menu.copied": "Copied",
			"menu.copyFailed": "Could not copy. Check that the content is available, then retry.",
			"open.title": "Open in {app}",
			"path.appDefault": "{app} (default)",
			"path.appsError": "Could not load applications",
			"shortcut.busy": "Opening workspace",
			"shortcut.unavailable": "Current workspace or local application unavailable",
			"open.tooltip": "Open locally",
			"path.open": "Open",
			"path.more": "More ways to open",
			"path.reveal": "Show file location",
			"path.opened": "Opened on another device",
			"path.revealed": "File location shown on another device",
			"path.openError": "Could not open. Try again.",
			"path.revealError": "Could not show the file location. Try again.",
			...PRODUCT_NAMES,
			"app.finder": "Finder",
			"app.explorer": "File Explorer",
			"app.filemanager": "Files",
			"app.terminal": "Terminal"
		};
		/** Japanese copy, checked against the English keys. */
		const ja = {
			"menu.openInSidebar": "サイドバーで開く",
			"menu.openInFloat": "フローティングパネルで開く",
			"menu.finder": "Finder に表示",
			"menu.reveal": "フォルダーに表示",
			"menu.defaultApp": "既定のアプリで開く",
			"menu.external": "外部ブラウザーで開く",
			"menu.copyLink": "リンクアドレスをコピー",
			"menu.copyPath": "ファイルパスをコピー",
			"menu.copyDirectoryPath": "フォルダーパスをコピー",
			"menu.copied": "コピーしました",
			"menu.copyFailed": "コピーできません。内容を確認して再試行してください。",
			...PRODUCT_NAMES,
			"open.title": "{app}で開く",
			"path.appDefault": "{app}（デフォルト）",
			"path.appsError": "アプリケーションを読み込めませんでした",
			"shortcut.busy": "ワークスペースを開いています",
			"shortcut.unavailable": "現在のワークスペースまたはローカルアプリケーションを利用できません",
			"open.tooltip": "ローカルで開く",
			"path.open": "開く",
			"path.more": "その他の開き方",
			"path.reveal": "ファイルの場所を表示",
			"path.opened": "別のデバイスで開きました",
			"path.revealed": "別のデバイスでファイルの場所を表示しました",
			"path.openError": "開けませんでした。もう一度お試しください。",
			"path.revealError": "ファイルの場所を表示できませんでした。もう一度お試しください。",
			"app.finder": "Finder",
			"app.explorer": "エクスプローラー",
			"app.filemanager": "ファイル",
			"app.terminal": "ターミナル"
		};
		/** Spanish dictionary, checked against the English keys. */
		const es = {
			"menu.openInSidebar": "Abrir en la barra lateral",
			"menu.openInFloat": "Abrir en un panel flotante",
			"menu.finder": "Mostrar en Finder",
			"menu.reveal": "Mostrar en la carpeta",
			"menu.defaultApp": "Abrir en la aplicación predeterminada",
			"menu.external": "Abrir en un navegador externo",
			"menu.copyLink": "Copiar dirección del enlace",
			"menu.copyPath": "Copiar ruta del archivo",
			"menu.copyDirectoryPath": "Copiar ruta de la carpeta",
			"menu.copied": "Copiado",
			"menu.copyFailed": "No se pudo copiar. Compruebe que el contenido esté disponible e inténtelo de nuevo.",
			"open.title": "Abrir en {app}",
			"path.appDefault": "{app} (predeterminado)",
			"path.appsError": "No se pudieron cargar aplicaciones",
			"shortcut.busy": "Abrir espacio de trabajo",
			"shortcut.unavailable": "El espacio de trabajo actual o la aplicación local no están disponibles",
			"open.tooltip": "Abierto localmente",
			"path.open": "Abrir",
			"path.more": "Más formas de abrir",
			"path.reveal": "Mostrar ubicación del archivo",
			"path.opened": "Abierto en otro dispositivo",
			"path.revealed": "Ubicación del archivo mostrada en otro dispositivo",
			"path.openError": "No se pudo abrir. Intentar otra vez.",
			"path.revealError": "No se pudo mostrar la ubicación del archivo. Intentar otra vez.",
			...PRODUCT_NAMES,
			"app.finder": "Finder",
			"app.explorer": "Explorador de archivos",
			"app.filemanager": "Archivos",
			"app.terminal": "terminales"
		};
		/** French dictionary, checked against the English keys. */
		const fr = {
			"menu.openInSidebar": "Ouvrir dans la barre latérale",
			"menu.openInFloat": "Ouvrir dans un panneau flottant",
			"menu.finder": "Afficher dans le Finder",
			"menu.reveal": "Afficher dans le dossier",
			"menu.defaultApp": "Ouvrir dans l’application par défaut",
			"menu.external": "Ouvrir dans un navigateur externe",
			"menu.copyLink": "Copier l’adresse du lien",
			"menu.copyPath": "Copier le chemin du fichier",
			"menu.copyDirectoryPath": "Copier le chemin du dossier",
			"menu.copied": "Copié",
			"menu.copyFailed": "Impossible de copier. Vérifiez que le contenu est disponible, puis réessayez.",
			"open.title": "Ouvrir dans {app}",
			"path.appDefault": "{app} (par défaut)",
			"path.appsError": "Impossible de charger les applications",
			"shortcut.busy": "Ouverture de l'espace de travail",
			"shortcut.unavailable": "Espace de travail actuel ou application locale indisponible",
			"open.tooltip": "Ouvrir localement",
			"path.open": "Ouvrir",
			"path.more": "Plus de façons d'ouvrir",
			"path.reveal": "Afficher l'emplacement du fichier",
			"path.opened": "Ouvert sur un autre appareil",
			"path.revealed": "Emplacement du fichier affiché sur un autre appareil",
			"path.openError": "Impossible d'ouvrir. Essayer à nouveau.",
			"path.revealError": "Impossible d'afficher l'emplacement du fichier. Essayer à nouveau.",
			...PRODUCT_NAMES,
			"app.finder": "Finder",
			"app.explorer": "Explorateur de fichiers",
			"app.filemanager": "Fichiers",
			"app.terminal": "Borne"
		};
		/** German dictionary, checked against the English keys. */
		const de = {
			"menu.openInSidebar": "In der Seitenleiste öffnen",
			"menu.openInFloat": "In schwebendem Panel öffnen",
			"menu.finder": "Im Finder anzeigen",
			"menu.reveal": "Im Ordner anzeigen",
			"menu.defaultApp": "In der Standardanwendung öffnen",
			"menu.external": "In einem externen Browser öffnen",
			"menu.copyLink": "Linkadresse kopieren",
			"menu.copyPath": "Dateipfad kopieren",
			"menu.copyDirectoryPath": "Ordnerpfad kopieren",
			"menu.copied": "Kopiert",
			"menu.copyFailed": "Kopieren fehlgeschlagen. Prüfen Sie, ob der Inhalt verfügbar ist, und versuchen Sie es erneut.",
			"open.title": "In {app} öffnen",
			"path.appDefault": "{app} (Standard)",
			"path.appsError": "Anwendungen konnten nicht geladen werden",
			"shortcut.busy": "Arbeitsbereich öffnen",
			"shortcut.unavailable": "Aktueller Arbeitsbereich oder lokale Anwendung nicht verfügbar",
			"open.tooltip": "Vor Ort geöffnet",
			"path.open": "Öffnen",
			"path.more": "Mehr Möglichkeiten zum Öffnen",
			"path.reveal": "Dateispeicherort anzeigen",
			"path.opened": "Auf einem anderen Gerät geöffnet",
			"path.revealed": "Dateispeicherort auf einem anderen Gerät angezeigt",
			"path.openError": "Konnte nicht geöffnet werden. Versuchen Sie es erneut.",
			"path.revealError": "Der Dateispeicherort konnte nicht angezeigt werden. Versuchen Sie es erneut.",
			...PRODUCT_NAMES,
			"app.finder": "Finder",
			"app.explorer": "Datei-Explorer",
			"app.filemanager": "Dateien",
			"app.terminal": "Terminal"
		};
		/** Russian dictionary, checked against the English keys. */
		const ru = {
			"menu.openInSidebar": "Открыть на боковой панели",
			"menu.openInFloat": "Открыть на плавающей панели",
			"menu.finder": "Показать в Finder",
			"menu.reveal": "Показать в папке",
			"menu.defaultApp": "Открыть в приложении по умолчанию",
			"menu.external": "Открыть во внешнем браузере",
			"menu.copyLink": "Копировать адрес ссылки",
			"menu.copyPath": "Копировать путь к файлу",
			"menu.copyDirectoryPath": "Копировать путь к папке",
			"menu.copied": "Скопировано",
			"menu.copyFailed": "Не удалось скопировать. Проверьте доступность содержимого и повторите попытку.",
			"open.title": "Открыть в {app}",
			"path.appDefault": "{app} (по умолчанию)",
			"path.appsError": "Не удалось загрузить приложения",
			"shortcut.busy": "Открытие рабочей области",
			"shortcut.unavailable": "Текущая рабочая область или локальное приложение недоступно.",
			"open.tooltip": "Открыть локально",
			"path.open": "Открыть",
			"path.more": "Больше способов открыть",
			"path.reveal": "Показать местоположение файла",
			"path.opened": "Открыто на другом устройстве",
			"path.revealed": "Местоположение файла показано на другом устройстве",
			"path.openError": "Не удалось открыть. Попробуйте еще раз.",
			"path.revealError": "Не удалось показать местоположение файла. Попробуйте еще раз.",
			...PRODUCT_NAMES,
			"app.finder": "Finder",
			"app.explorer": "Проводник файлов",
			"app.filemanager": "Файлы",
			"app.terminal": "Терминал"
		};
		/** Portuguese dictionary, checked against the English keys. */
		const pt = {
			"menu.openInSidebar": "Abrir na barra lateral",
			"menu.openInFloat": "Abrir em painel flutuante",
			"menu.finder": "Mostrar no Finder",
			"menu.reveal": "Mostrar na pasta",
			"menu.defaultApp": "Abrir no aplicativo padrão",
			"menu.external": "Abrir em um navegador externo",
			"menu.copyLink": "Copiar endereço do link",
			"menu.copyPath": "Copiar caminho do arquivo",
			"menu.copyDirectoryPath": "Copiar caminho da pasta",
			"menu.copied": "Copiado",
			"menu.copyFailed": "Não foi possível copiar. Verifique se o conteúdo está disponível e tente novamente.",
			"open.title": "Abrir em {app}",
			"path.appDefault": "{app} (padrão)",
			"path.appsError": "Não foi possível carregar aplicativos",
			"shortcut.busy": "Abrindo espaço de trabalho",
			"shortcut.unavailable": "Espaço de trabalho atual ou aplicativo local indisponível",
			"open.tooltip": "Abrir localmente",
			"path.open": "Abrir",
			"path.more": "Mais maneiras de abrir",
			"path.reveal": "Mostrar localização do arquivo",
			"path.opened": "Aberto em outro dispositivo",
			"path.revealed": "Localização do arquivo exibida em outro dispositivo",
			"path.openError": "Não foi possível abrir. Tente novamente.",
			"path.revealError": "Não foi possível mostrar o local do arquivo. Tente novamente.",
			...PRODUCT_NAMES,
			"app.finder": "Finder",
			"app.explorer": "Explorador de arquivos",
			"app.filemanager": "Arquivos",
			"app.terminal": "Terminais"
		};
		//#endregion
		//#region lib/types/client/open-toast.js
		/**
		* Create the one outcome store the overlay entry shows.
		* @returns the observable notice with its report and dismiss actions.
		*/
		function createOpenInAppToastSource() {
			const store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(null);
			let seq = 0;
			return {
				hooks: { toast: store },
				report: (outcome) => {
					if (outcome.kind === "skipped") return;
					if (outcome.kind !== "failed" && !(0, _deepseek_ai_dsh_client_ui_primitives.isMobileDevice)()) return;
					seq += 1;
					store.set({
						...outcome,
						seq
					});
				},
				dismiss: () => {
					store.set(null);
				}
			};
		}
		/**
		* Render a mobile handoff confirmation or a native-open failure.
		* @param props - the notice hook, its dismissal, and the locale seat.
		* @returns the banner on display, or null.
		*/
		function OpenInAppToast({ useToast, dismiss, t }) {
			const toast = useToast((current) => current);
			if (toast === null) return null;
			const key = `open-in-app-${String(toast.seq)}`;
			if (toast.kind === "failed") return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
				text: t(toast.failure === "revealError" ? "path.revealError" : "path.openError"),
				icon: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconWarningOutlineRegular, {}),
				onDone: dismiss
			}, key);
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Toast, {
				text: t(toast.kind === "opened" ? "path.opened" : "path.revealed"),
				tone: "success",
				onDone: dismiss
			}, key);
		}
		//#endregion
		//#region lib/types/client/index.js
		/**
		* Shared native opening controls for workspace directories, document previews,
		* delivery cards, and changed-file review. Directory choices persist in the browser;
		* file defaults and application lists come from the serving Host desktop.
		*/
		/** Required services: sessions, layout selection, the slot registry, copy, Remote calls, and shortcuts. */
		const inject = [
			"contextMenus",
			"sidebarRight",
			"sidebarRightTabs",
			"sessions",
			"slots",
			"locale",
			"remote",
			"remote.session",
			"remote.workspaceFiles",
			"shortcuts",
			"layout"
		];
		/**
		* Client plugin body: register dictionaries, workspace directory controls, and
		* document preview path controls.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const controller = new OpenInAppController();
			controller.load();
			const paths = new OpenInAppPathController(ctx.remote);
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en,
				ja,
				es,
				fr,
				de,
				ru,
				pt
			}), "open-in-app: dictionaries");
			const t = ctx.locale.bind(NS);
			const announcement = createOpenInAppToastSource();
			ctx.slots.inject("contextMenu.icon", function* () {
				for (const [key, Icon] of Object.entries({
					"open-in-app.reveal": _deepseek_ai_dsh_client_ui_primitives.IconFolderOpenOutlineRegular,
					"open-in-app.copy": _deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular,
					"open-in-app.sidebar": _deepseek_ai_dsh_client_ui_primitives.IconPanelLeftOutlineRegular,
					"open-in-app.float": _deepseek_ai_dsh_client_ui_primitives.IconRightUpOutlineRegular
				})) yield ctx.slots.register({
					name: "contextMenu.icon",
					key
				}, Icon);
				yield ctx.slots.register({
					name: "contextMenu.icon",
					key: "open-in-app.application"
				}, ContextMenuApplicationIcon);
			});
			registerContextMenus(ctx, paths, t, controller, announcement.report);
			registerSessionReveal(ctx, controller, t, announcement.report);
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "open-in-app.toast",
				locale: NS,
				inject: () => ({
					hooks: announcement.hooks,
					dismiss: announcement.dismiss
				})
			}, OpenInAppToast));
			const emptyDirectory = { subscribe: () => () => {}, getSnapshot: () => undefined };
      const directoryStore = id => ctx.sessions.binding(id)?.session.projections.faceOf('workingDirectory') ?? emptyDirectory;
      const target = () => {
				if (ctx.layout.panelInfo.getSnapshot().activePanelId !== null) return void 0;
				const session = Object.values(ctx.sessions.list.getSnapshot().byId).find((row) => (row.retainedBy.mainView ?? 0) > 0);
				const appId = controller.currentApp();
				const cwd = session && (directoryStore(session.id).getSnapshot() ?? session.cwd);
        return cwd && appId !== void 0 ? {
          appId,
          path: cwd
				} : void 0;
			};
			ctx.effect(() => ctx.shortcuts.register({
				id: "workspace.openLocal",
				label: () => t("open.tooltip"),
				aliases: ["open workspace locally", "open in app"],
				defaults: {
					"desktop:macos": {
						code: "KeyO",
						modifiers: ["primary", "alt"]
					},
					"desktop:windows": {
						code: "KeyO",
						modifiers: ["primary", "alt"]
					},
					"desktop:linux": {
						code: "KeyO",
						modifiers: ["primary", "alt"]
					},
					"web:macos": {
						code: "KeyO",
						modifiers: ["primary", "shift"]
					},
					"web:windows": {
						code: "KeyO",
						modifiers: ["primary", "shift"]
					}
				},
				regions: ["page", "editable"],
				modals: [],
				resolve: () => {
					if (controller.operation.getSnapshot().phase === "busy") return {
						status: "blocked",
						reason: t("shortcut.busy")
					};
					const selected = target();
					if (selected === void 0) return {
						status: "blocked",
						reason: t("shortcut.unavailable")
					};
					return {
						status: "handled",
						run: () => {
							controller.launch(selected.appId, selected.path).then(announcement.report);
						}
					};
				}
			}), "open-in-app: workspace command");
			const directoryInjected = () => ({
				hooks: {
					openInAppApps: controller.apps,
					openInAppChoice: controller.choice,
					openInAppLaunch: controller.operation,
					shortcuts: ctx.shortcuts.catalog
				},
				launch: (appId, path) => controller.launch(appId, path),
				report: announcement.report,
				choose: (appId) => {
					controller.choose(appId);
				},
				iconUrl: (appId) => `${OPEN_IN_APP_ICON_PREFIX_ROUTE}/${appId}`
			});
			function SessionOpenInAppAction(props) {
				const { sessionId, useSessions } = props;
				const initial = useSessions((state) => state.byId[sessionId]?.cwd);
        const store = directoryStore(sessionId);
        const cwd = react.useSyncExternalStore(fn => store.subscribe(fn), () => store.getSnapshot()) ?? initial;
				return cwd ? (0, react.createElement)(OpenInAppAction, {
					...props,
					absolutePath: cwd
				}) : null;
			}
			ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "open-in-app",
				order: -10,
				locale: NS,
				inject: directoryInjected
			}, SessionOpenInAppAction));
			ctx.slots.inject("sidebar.right.tab.files.actions", () => ctx.slots.register({
				name: "sidebar.right.tab.files.actions",
				id: "open-in-app",
				locale: NS,
				inject: directoryInjected
			}, OpenInAppAction));
			const applications = (path, signal) => paths.applications(path, signal);
			const pathInjected = () => ({
				hooks: { openInAppDesktop: paths.desktop },
				loadDesktop: () => paths.load(),
				openPath: (path, action, application) => paths.openPath(path, action, application),
				applications,
				report: announcement.report
			});
			ctx.slots.inject("sidebar.right.tab.document.actions", () => ctx.slots.register({
				name: "sidebar.right.tab.document.actions",
				id: "open-in-app",
				locale: NS,
				inject: pathInjected
			}, OpenPathAction));
			ctx.slots.inject("sidebar.right.tab.document.unpreviewable", () => ctx.slots.register({
				name: "sidebar.right.tab.document.unpreviewable",
				id: "open-in-app",
				locale: NS,
				inject: pathInjected
			}, OpenPathEmptyAction));
			const routeInjected = () => ({ report: announcement.report });
			ctx.slots.inject("deliverables.file.actions", () => ctx.slots.register({
				name: "deliverables.file.actions",
				id: "open-in-app",
				locale: NS,
				inject: routeInjected
			}, FileRouteAction));
			ctx.slots.inject("deliverables.review.file.actions", () => ctx.slots.register({
				name: "deliverables.review.file.actions",
				id: "open-in-app",
				locale: NS,
				inject: routeInjected
			}, FileRouteAction));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
};


return registration.factory(require); }
