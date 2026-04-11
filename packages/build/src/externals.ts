export function resolveExternals(
  packageJson: Record<string, unknown>,
  configExternals?: string[],
): string[] {
  const deps = new Set<string>();

  const dependencies = packageJson.dependencies as Record<string, string> | undefined;
  if (dependencies) {
    for (const key of Object.keys(dependencies)) {
      deps.add(key);
    }
  }

  const peerDependencies = packageJson.peerDependencies as Record<string, string> | undefined;
  if (peerDependencies) {
    for (const key of Object.keys(peerDependencies)) {
      deps.add(key);
    }
  }

  if (configExternals) {
    for (const ext of configExternals) {
      deps.add(ext);
    }
  }

  return [...deps];
}
