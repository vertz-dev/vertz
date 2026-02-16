export function defineConfig(config) {
  return config;
}
export function resolveConfig(config) {
  return {
    strict: config?.strict ?? false,
    forceGenerate: config?.forceGenerate ?? false,
    compiler: {
      sourceDir: config?.compiler?.sourceDir ?? 'src',
      outputDir: config?.compiler?.outputDir ?? '.vertz/generated',
      entryFile: config?.compiler?.entryFile ?? 'src/app.ts',
      schemas: {
        enforceNaming: config?.compiler?.schemas?.enforceNaming ?? true,
        enforcePlacement: config?.compiler?.schemas?.enforcePlacement ?? true,
      },
      openapi: {
        output: config?.compiler?.openapi?.output ?? '.vertz/generated/openapi.json',
        info: {
          title: config?.compiler?.openapi?.info?.title ?? 'Vertz API',
          version: config?.compiler?.openapi?.info?.version ?? '1.0.0',
          description: config?.compiler?.openapi?.info?.description,
        },
      },
      validation: {
        requireResponseSchema: config?.compiler?.validation?.requireResponseSchema ?? true,
        detectDeadCode: config?.compiler?.validation?.detectDeadCode ?? true,
      },
    },
  };
}
//# sourceMappingURL=config.js.map
