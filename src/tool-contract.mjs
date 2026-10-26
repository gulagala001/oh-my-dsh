import { assertObjectJsonSchema, assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';

// One public contract drives Native, both SDK renderers and execution. Business
// limits belong in documented arguments and the owner's semantic validation.
export function checkedTool(definition) {
  assertObjectJsonSchema(definition.parameters);
  assertSupportedJsonSchema(definition.parameters);
  assertSupportedJsonSchema(definition.output.schema);
  const execute = definition.execute;
  return { ...definition, async execute(args, exec) {
    const errors = validateJsonSchemaValue(definition.parameters, args);
    if (errors.length) throw new Error(`Rejected: invalid ${definition.name} arguments: ${errors.join('; ')}`);
    return execute.call(this, args, exec);
  } };
}
