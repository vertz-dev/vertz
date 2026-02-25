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
  return (
    `const __$fr = globalThis[Symbol.for('vertz:fast-refresh')];\n` +
    `const { __$refreshReg, __$refreshTrack, __$refreshPerform, ` +
    `pushScope: __$pushScope, popScope: __$popScope, ` +
    `_tryOnCleanup: __$tryCleanup, runCleanups: __$runCleanups, ` +
    `getContextScope: __$getCtx, setContextScope: __$setCtx, ` +
    `startSignalCollection: __$startSigCol, stopSignalCollection: __$stopSigCol } = __$fr;\n` +
    `const __$moduleId = '${escapedId}';\n`
  );
}

/**
 * Generate the Fast Refresh wrapper and registration code for a component.
 *
 * For each component, generates:
 * 1. A wrapper function that captures disposal scope and context
 * 2. Registration call to track the component in the registry
 */
export function generateRefreshWrapper(componentName: string): string {
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
    `__$refreshReg(__$moduleId, '${componentName}', ${componentName});\n`
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
 */
export function generateRefreshCode(
  moduleId: string,
  components: ComponentInfo[],
): { preamble: string; epilogue: string } | null {
  if (components.length === 0) return null;

  const preamble = generateRefreshPreamble(moduleId);

  let epilogue = '';
  for (const comp of components) {
    epilogue += generateRefreshWrapper(comp.name);
  }
  epilogue += generateRefreshPerform();

  return { preamble, epilogue };
}
