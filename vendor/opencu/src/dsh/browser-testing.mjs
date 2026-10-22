const helper = new URL('../browser/automation.mjs', import.meta.url).href;

export const browserTestingGuide = `For browser previews and UI checks, reuse a suitable connected browser through computer_use when available. When an isolated browser is needed for rendering, WebGL diagnostics, screenshots or project tests, keep that capability and use the project's Playwright runner or the installed helper below in a Node script:
const { withIsolatedBrowser } = await import(${JSON.stringify(helper)});
await withIsolatedBrowser(async ({ context }) => {
  const page = context.pages()[0] ?? await context.newPage();
  // Navigate, inspect with page.evaluate, test and capture here. Reuse this context for related checks.
}, { directory: '.local/browser-checks', timeoutMs: 30000 });
The helper owns a temporary profile, preserves credential isolation, and closes its browser on success, failure, timeout or cancellation. launchOptions may supply an executablePath or rendering flags; it never modifies a connected personal browser. Prefer it to writing a raw Chrome process/CDP driver.
If a direct Chromium/Chrome launch is actually required, use a separate temporary --user-data-dir AND --use-mock-keychain --password-store=basic. Headless mode or a new profile alone does not prevent macOS keychain access. Preserve these flags when overriding args or ignoreDefaultArgs. Close only the owned process and remove only its temporary profile in finally; do not repeatedly launch after an unknown outcome. A keychain password or permanent keychain grant is not needed for an automated page check.`;
