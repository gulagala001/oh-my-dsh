import { installTools } from '#opencu/integration';

/** Preset consumers share the bundled or standalone OpenCU registration. */
export function acquireComputer() {
  return {
    async installTools(scope) {
      await installTools(scope, { namespace: 'omd-consumer', configuration: false }).ready;
      return ['computer_use', 'computer_use_reset'];
    },
  };
}
