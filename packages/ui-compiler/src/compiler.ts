import MagicString from 'magic-string';
import { Project, ts } from 'ts-morph';
import { ComponentAnalyzer } from './analyzers/component-analyzer';
import { JsxAnalyzer } from './analyzers/jsx-analyzer';
import { MutationAnalyzer } from './analyzers/mutation-analyzer';
import { ReactivityAnalyzer } from './analyzers/reactivity-analyzer';
import { MutationDiagnostics } from './diagnostics/mutation-diagnostics';
import { PropsDestructuringDiagnostics } from './diagnostics/props-destructuring';
import { ComputedTransformer } from './transformers/computed-transformer';
import { JsxTransformer } from './transformers/jsx-transformer';
import { MutationTransformer } from './transformers/mutation-transformer';
import { SignalTransformer } from './transformers/signal-transformer';
import type { CompileOutput, CompilerDiagnostic } from './types';

/**
 * Main compile pipeline.
 *
 * 1. Parse → 2. Component analysis → 3. Reactivity analysis →
 * 4. Mutation analysis + transform → 5. Signal transform →
 * 6. Computed transform → 7. JSX analysis →
 * 8. JSX transform (includes prop transform) →
 * 9. Diagnostics → 10. Add imports → 11. Return { code, map, diagnostics }
 */
export function compile(source: string, filename = 'input.tsx'): CompileOutput {
  // 1. Parse
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      strict: true,
    },
  });
  const sourceFile = project.createSourceFile(filename, source);
  const s = new MagicString(source);
  const allDiagnostics: CompilerDiagnostic[] = [];

  // 2. Component analysis
  const componentAnalyzer = new ComponentAnalyzer();
  const components = componentAnalyzer.analyze(sourceFile);

  if (components.length === 0) {
    // No components found — return source unchanged
    return {
      code: source,
      map: s.generateMap({ source: filename, includeContent: true }),
      diagnostics: [],
    };
  }

  // Track which runtime features are used
  const usedFeatures = new Set<string>();

  // Process each component
  for (const component of components) {
    // 3. Reactivity analysis
    const reactivityAnalyzer = new ReactivityAnalyzer();
    const variables = reactivityAnalyzer.analyze(sourceFile, component);

    const hasSignals = variables.some((v) => v.kind === 'signal');
    const hasComputeds = variables.some((v) => v.kind === 'computed');

    if (hasSignals) usedFeatures.add('signal');
    if (hasComputeds) usedFeatures.add('computed');

    // 4. Mutation analysis + transform (BEFORE signal/computed transforms so
    //    mutation expressions use the original variable names for peek/notify,
    //    and BEFORE JSX transform so mutations inside event handlers are
    //    picked up by source.slice() in JSX transform)
    const mutationAnalyzer = new MutationAnalyzer();
    const mutations = mutationAnalyzer.analyze(sourceFile, component, variables);
    const mutationRanges = mutations.map((m) => ({ start: m.start, end: m.end }));
    if (mutations.length > 0) {
      const mutationTransformer = new MutationTransformer();
      mutationTransformer.transform(s, component, mutations);
    }

    // 5. Signal transform (skips identifiers inside mutation ranges)
    const signalTransformer = new SignalTransformer();
    signalTransformer.transform(s, sourceFile, component, variables, mutationRanges);

    // 6. Computed transform
    const computedTransformer = new ComputedTransformer();
    computedTransformer.transform(s, sourceFile, component, variables);

    // 7. JSX analysis
    const jsxAnalyzer = new JsxAnalyzer();
    const jsxExpressions = jsxAnalyzer.analyze(sourceFile, component, variables);

    // Detect used DOM helpers from JSX
    if (jsxExpressions.some((e) => e.reactive)) {
      usedFeatures.add('__text');
      usedFeatures.add('__attr');
    }
    usedFeatures.add('__element');
    usedFeatures.add('__on');

    // 8+9. JSX transform (includes prop transform)
    //      JSX transform reads from MagicString via source.slice() to pick up
    //      all prior transforms (signal .value, computed .value, mutation peek/notify)
    const jsxTransformer = new JsxTransformer();
    jsxTransformer.transform(s, sourceFile, component, variables, jsxExpressions);

    // 11. Diagnostics
    const mutationDiags = new MutationDiagnostics();
    allDiagnostics.push(...mutationDiags.analyze(sourceFile, component, variables));
  }

  // Props destructuring diagnostics (across all components)
  const propsDiags = new PropsDestructuringDiagnostics();
  allDiagnostics.push(...propsDiags.analyze(sourceFile, components));

  // 12. Add runtime imports
  const imports = buildImportStatement(usedFeatures);
  if (imports) {
    s.prepend(`${imports}\n`);
  }

  // 13. Return result
  const map = s.generateMap({
    source: filename,
    includeContent: true,
  });

  return {
    code: s.toString(),
    map,
    diagnostics: allDiagnostics,
  };
}

/** Build import statement based on used features. */
function buildImportStatement(features: Set<string>): string | null {
  const runtimeImports: string[] = [];
  const domImports: string[] = [];

  for (const feature of features) {
    if (
      feature === 'signal' ||
      feature === 'computed' ||
      feature === 'effect' ||
      feature === 'batch' ||
      feature === 'untrack'
    ) {
      runtimeImports.push(feature);
    } else if (feature.startsWith('__')) {
      domImports.push(feature);
    }
  }

  const parts: string[] = [];
  if (runtimeImports.length > 0 || domImports.length > 0) {
    const allImports = [...runtimeImports, ...domImports].sort();
    parts.push(`import { ${allImports.join(', ')} } from '@vertz/ui';`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
