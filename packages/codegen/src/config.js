// ── Codegen Config Types ────────────────────────────────────────
const VALID_GENERATORS = new Set(['typescript', 'cli']);
// ── defineCodegenConfig ─────────────────────────────────────────
export function defineCodegenConfig(config) {
  return config;
}
// ── resolveCodegenConfig ────────────────────────────────────────
export function resolveCodegenConfig(config) {
  return {
    generators: config?.generators ?? ['typescript'],
    outputDir: config?.outputDir ?? '.vertz/generated',
    format: config?.format,
    incremental: config?.incremental,
    typescript: config?.typescript,
    cli: config?.cli,
  };
}
// ── validateCodegenConfig ───────────────────────────────────────
export function validateCodegenConfig(config) {
  const errors = [];
  if (config.generators.length === 0) {
    errors.push('codegen.generators must contain at least one generator');
  }
  for (const gen of config.generators) {
    if (!VALID_GENERATORS.has(gen)) {
      errors.push(`codegen.generators contains unknown generator: "${gen}"`);
    }
  }
  if (config.typescript?.publishable) {
    const pub = config.typescript.publishable;
    if (!pub.name) {
      errors.push('codegen.typescript.publishable.name is required');
    }
    if (!pub.outputDir) {
      errors.push('codegen.typescript.publishable.outputDir is required');
    }
  }
  if (config.cli?.publishable) {
    const pub = config.cli.publishable;
    if (!pub.name) {
      errors.push('codegen.cli.publishable.name is required');
    }
    if (!pub.outputDir) {
      errors.push('codegen.cli.publishable.outputDir is required');
    }
    if (!pub.binName) {
      errors.push('codegen.cli.publishable.binName is required');
    }
  }
  return errors;
}
//# sourceMappingURL=config.js.map
