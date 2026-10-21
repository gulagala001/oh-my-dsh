/** Preset consumers share the bundled or standalone OpenCU registration. */
export function acquireComputer() {
  return {
    async installTools(scope) {
      const { installTools } = await import('#opencu/integration');
      scope.fiber.assertActive();
      await installTools(scope, { namespace: 'omd-consumer', configuration: false }).ready;
      return ['computer_use', 'computer_use_reset'];
    },
  };
}
