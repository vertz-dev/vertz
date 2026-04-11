export function resolveExternals(
  packageJson: Record<string, unknown>,
  configExternals?: string[],
): string[] {
  const deps = new Set<string>();

  const dependencies = packageJson.dependencies as Record<string, string> | undefined;
  if (dependencies) {
    for (const key of Object.keys(dependencies)) {
      deps.add(key);
      // Add wildcard pattern for subpath imports (e.g. @vertz/ui → @vertz/ui/*)
      deps.add(`${key}/*`);
    }
  }

  const peerDependencies = packageJson.peerDependencies as Record<string, string> | undefined;
  if (peerDependencies) {
    for (const key of Object.keys(peerDependencies)) {
      deps.add(key);
      deps.add(`${key}/*`);
    }
  }

  // Externalize devDeps to avoid bundling build-time tools (typescript, test frameworks, etc.)
  // that use CJS or node builtins incompatible with ESM output. Matches bunup's behavior.
  const devDependencies = packageJson.devDependencies as Record<string, string> | undefined;
  if (devDependencies) {
    for (const key of Object.keys(devDependencies)) {
      deps.add(key);
      deps.add(`${key}/*`);
    }
  }

  const optionalDependencies = packageJson.optionalDependencies as Record<string, string> | undefined;
  if (optionalDependencies) {
    for (const key of Object.keys(optionalDependencies)) {
      deps.add(key);
      deps.add(`${key}/*`);
    }
  }

  if (configExternals) {
    for (const ext of configExternals) {
      deps.add(ext);
    }
  }

  return [...deps];
}
