const defaultPromptAdapter = {
  async select({ message, choices }) {
    // In non-interactive mode, return the first choice
    if (choices.length > 0) {
      const first = choices[0];
      if (first) {
        return first.value;
      }
    }
    throw new CliRuntimeError(`No choices available for prompt: ${message}`);
  },
  async text({ message, defaultValue }) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new CliRuntimeError(`Missing required input: ${message}`);
  },
};
export class CliRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliRuntimeError';
  }
}
export async function resolveParameters(
  definition,
  flags,
  resolvers,
  context,
  promptAdapter = defaultPromptAdapter,
) {
  const resolved = { ...flags };
  // Collect all fields from params, query, body
  const allFields = [];
  if (definition.params) {
    for (const [name, field] of Object.entries(definition.params)) {
      allFields.push({ name, field, source: 'params' });
    }
  }
  if (definition.query) {
    for (const [name, field] of Object.entries(definition.query)) {
      allFields.push({ name, field, source: 'query' });
    }
  }
  if (definition.body) {
    for (const [name, field] of Object.entries(definition.body)) {
      allFields.push({ name, field, source: 'body' });
    }
  }
  // For each required field, check if it's provided, otherwise resolve interactively
  for (const { name, field } of allFields) {
    if (resolved[name] !== undefined) {
      // Already provided via flags
      resolved[name] = coerceValue(resolved[name], field.type);
      continue;
    }
    if (!field.required) {
      continue;
    }
    // Check if there's a resolver for this parameter
    const resolver = resolvers[name];
    if (resolver) {
      const options = await resolver.fetchOptions(context);
      const value = await promptAdapter.select({
        message: resolver.prompt,
        choices: options,
      });
      resolved[name] = value;
      continue;
    }
    // If required and no resolver, prompt for text input
    if (field.enum && field.enum.length > 0) {
      const choices = field.enum.map((v) => ({ label: v, value: v }));
      const value = await promptAdapter.select({
        message: field.description ?? `Select ${name}`,
        choices,
      });
      resolved[name] = value;
    } else {
      const value = await promptAdapter.text({
        message: field.description ?? `Enter ${name}`,
      });
      resolved[name] = coerceValue(value, field.type);
    }
  }
  return resolved;
}
function coerceValue(value, type) {
  if (typeof value === 'string') {
    switch (type) {
      case 'number':
      case 'integer':
        return Number(value);
      case 'boolean':
        return value === 'true' || value === '1';
      default:
        return value;
    }
  }
  return value;
}
//# sourceMappingURL=resolver.js.map
