/** Read execution paths from the host; project identity remains in the header. */
export function currentDirectory(ctx, session) {
  return ctx.get?.('workingDirectory')?.get(session) ?? session.header.cwd;
}
