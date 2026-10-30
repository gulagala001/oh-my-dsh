/** Apply the reviewed lifecycle corrections to the matching owned host source. */
export async function applyRuntimeLifecycle(patch, target) {
  if (target.id !== '021rc5') return;
  await patch('apps/desktop-host/src/office.ts', [
    ['  await ctx.plugin(workspaceDependencies, config)', '  // opencu-office-lifetime:v1\n  const dependencies = ctx.plugin(workspaceDependencies, config)'],
    ['  await ctx.plugin(officeSkills, {', '  const skills = ctx.plugin(officeSkills, {'],
    ["    cli: join(packageRoot, 'lib', 'cli.js'),\n  })", "    cli: join(packageRoot, 'lib', 'cli.js'),\n  })\n  // Both children declare their service dependencies; mount them before yielding.\n  await Promise.all([dependencies, skills])"],
  ], '// opencu-office-lifetime:v1');
  await patch('apps/desktop-host/src/index.ts', [
    ['  const { ctx } = await application', '  const { ctx } = await application\n  // opencu-startup-shutdown:v1\n  if (stopping !== undefined || ctx.fiber.uid === null) return'],
    ['  installPlatformSessionPublisher(ctx, (session) => {', '  if (stopping !== undefined || ctx.fiber.uid === null) return\n  installPlatformSessionPublisher(ctx, (session) => {'],
  ], '// opencu-startup-shutdown:v1');
  await patch('packages/core/tools/src/index.ts', [
    ['    } catch (error: unknown) {\n      return toolErrorResult(error)\n    } finally {\n      fused.dispose()',
      '    } catch (error: unknown) {\n      // opencu-tool-cancellation:v1\n      // A thrown caller reason is cancellation; unrelated failures stay failures.\n      return isAborted(signal) && error === signal.reason ? toolAbortedResult() : toolErrorResult(error)\n    } finally {\n      fused.dispose()'],
  ], '// opencu-tool-cancellation:v1');
  await patch('apps/desktop/src/web-document.ts', [
    ['/**\n * Response headers not relayed to the renderer.', `/**
 * Create native HTTP access using the cookie already issued to this Host owner.
 * @param host - Authenticated launch URL of the owned local Host.
 * @param cookie - Cookie returned by authenticateWebHost.
 * @returns Requests restricted to this Host, without redirecting its credential.
 */
export function createAuthenticatedHostFetch(host: string, cookie: string): (input: string, init?: RequestInit) => Promise<Response> {
  // opencu-native-host-cookie:v1
  const origin = new URL(host).origin
  return (input, init = {}) => {
    const target = new URL(input)
    if (target.origin !== origin) throw new Error('Desktop Host request changed origin')
    const headers = new Headers(init.headers)
    headers.set('cookie', cookie)
    return fetch(target, { ...init, headers, redirect: 'error' })
  }
}

/**
 * Response headers not relayed to the renderer.`],
  ], '// opencu-native-host-cookie:v1');
  await patch('apps/desktop/src/main.ts', [
    ["import { serveWebDocument, authenticateWebHost, forwardWebRequest } from './web-document.ts'", "import { serveWebDocument, authenticateWebHost, forwardWebRequest, createAuthenticatedHostFetch } from './web-document.ts'"],
    ["        welcomeBackend = await connectDesktopWelcome(ready.url, (input, init) => net.fetch(input, init), async () => (await session.defaultSession.cookies.get({ url: ready.url })).map(cookie => `${cookie.name}=${cookie.value}`).join('; '))",
      "        // opencu-native-welcome-cookie:v1\n        const welcomeCookie = hostCookie\n        welcomeBackend = await connectDesktopWelcome(new URL(ready.url).origin, createAuthenticatedHostFetch(ready.url, welcomeCookie), async () => welcomeCookie)"],
  ], '// opencu-native-welcome-cookie:v1');
}
