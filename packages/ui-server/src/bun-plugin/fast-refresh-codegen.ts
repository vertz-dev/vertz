import type { ComponentInfo } from '@vertz/ui-compiler';

/**
 * Generate the Fast Refresh preamble code injected at the top of a module.
 *
 * This accesses the Fast Refresh runtime from globalThis instead of importing
 * it — critical because Bun's HMR propagates updates through the import graph.
 * Adding imports to @vertz/ui/internals would cause those chunks to appear in
 * HMR updates, triggering full page reloads.
 */
export function generateRefreshPreamble(moduleId: string): string {
  const escapedId = moduleId.replace(/['\\]/g, '\\$&');
  // Use `?? {}` so destructuring is safe on the server side where the
  // Fast Refresh runtime isn't loaded. Default values make every function
  // a no-op on the server — the wrapper still executes but has no effect.
  const noop = '() => {}';
  const noopArr = '() => []';
  const noopNull = '() => null';
  const noopPassthrough = '(_m, _n, el) => el';
  return (
    `const __$fr = globalThis[Symbol.for('vertz:fast-refresh')] ?? {};\n` +
    `const { ` +
    `__$refreshReg = ${noop}, ` +
    `__$refreshTrack = ${noopPassthrough}, ` +
    `__$refreshPerform = ${noop}, ` +
    `pushScope: __$pushScope = ${noopArr}, ` +
    `popScope: __$popScope = ${noop}, ` +
    `_tryOnCleanup: __$tryCleanup = ${noop}, ` +
    `runCleanups: __$runCleanups = ${noop}, ` +
    `getContextScope: __$getCtx = ${noopNull}, ` +
    `setContextScope: __$setCtx = ${noopNull}, ` +
    `startSignalCollection: __$startSigCol = ${noop}, ` +
    `stopSignalCollection: __$stopSigCol = ${noopArr} } = __$fr;\n` +
    `const __$moduleId = '${escapedId}';\n`
  );
}

/**
 * Generate the Fast Refresh wrapper and registration code for a component.
 *
 * For each component, generates:
 * 1. A wrapper function that captures disposal scope and context
 * 2. Registration call to track the component in the registry
 *
 * Uses a per-component hash so only components whose code actually changed
 * are marked dirty and re-mounted. This prevents parent component refreshes
 * from overwriting child component state when both are in the same file.
 */
export function generateRefreshWrapper(componentName: string, componentHash: string): string {
  return (
    `\nconst __$orig_${componentName} = ${componentName};\n` +
    `${componentName} = function(...__$args) {\n` +
    `  const __$scope = __$pushScope();\n` +
    `  const __$ctx = __$getCtx();\n` +
    `  __$startSigCol();\n` +
    `  const __$ret = __$orig_${componentName}.apply(this, __$args);\n` +
    `  const __$sigs = __$stopSigCol();\n` +
    `  __$popScope();\n` +
    `  if (__$scope.length > 0) {\n` +
    `    __$tryCleanup(() => __$runCleanups(__$scope));\n` +
    `  }\n` +
    `  return __$refreshTrack(__$moduleId, '${componentName}', __$ret, __$args, __$scope, __$ctx, __$sigs);\n` +
    `};\n` +
    `__$refreshReg(__$moduleId, '${componentName}', ${componentName}, '${componentHash}');\n`
  );
}

/**
 * Generate the Fast Refresh perform call (module epilogue).
 *
 * Called after module re-evaluation to trigger DOM replacement
 * for all tracked component instances.
 */
export function generateRefreshPerform(): string {
  return `__$refreshPerform(__$moduleId);\n`;
}

/**
 * Generate all Fast Refresh code for a module with detected components.
 *
 * Returns null if no components were detected (no Fast Refresh needed).
 * Uses per-component hashing: each component gets a hash of its own body,
 * so only the changed component is marked dirty and re-mounted.
 */
export function generateRefreshCode(
  moduleId: string,
  components: ComponentInfo[],
  source: string,
): { preamble: string; epilogue: string } | null {
  if (components.length === 0) return null;

  const preamble = generateRefreshPreamble(moduleId);

  let epilogue = '';
  for (const comp of components) {
    // Hash each component's body individually so only changed components
    // are marked dirty. This prevents parent refreshes from overwriting
    // child state when both components live in the same file.
    const body = source.slice(comp.bodyStart, comp.bodyEnd);
    const hash = Bun.hash(body).toString(36);
    epilogue += generateRefreshWrapper(comp.name, hash);
  }
  epilogue += generateRefreshPerform();

  return { preamble, epilogue };
}
