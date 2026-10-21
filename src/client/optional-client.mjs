// A failed optional child releases its own registrations, never the resident
// Conversation/Chat providers. Factory evaluation belongs inside this boundary.
export async function mountOptionalClient(ctx, name, load, report) {
  let reported;
  const failed = error => {
    if (error !== reported && ctx.fiber.uid !== null && [1, 2].includes(ctx.fiber.state)) {
      reported = error; report(name, error);
    }
  };
  try {
    const plugin = await load();
    ctx.fiber.assertActive();
    const fiber = ctx.plugin({ ...plugin, name }), uid = fiber.uid;
    // A pending child can activate only after a later service arrival/reload.
    ctx.on('internal/status', changed => {
      if (changed.uid === uid && changed.state === 3) void fiber.await().catch(failed);
    }, { global: true });
    await fiber;
    return true;
  } catch (error) {
    failed(error);
    return false;
  }
}
