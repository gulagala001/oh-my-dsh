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
}
