/**
 * Warn when component props are destructured in the parameter.
 * Destructuring breaks reactivity because it eagerly reads values.
 */
export class PropsDestructuringDiagnostics {
  analyze(sourceFile, components) {
    const diagnostics = [];
    for (const comp of components) {
      if (comp.hasDestructuredProps) {
        // Find the approximate line/column of the function declaration
        const pos = sourceFile.getLineAndColumnAtPos(comp.bodyStart);
        diagnostics.push({
          code: 'props-destructuring',
          message: `Component \`${comp.name}\` destructures props in the parameter list. This breaks reactivity — use \`props.x\` access instead.`,
          severity: 'warning',
          line: pos.line,
          column: pos.column - 1,
          fix: `Change \`function ${comp.name}({ ... })\` to \`function ${comp.name}(props)\` and access via \`props.x\``,
        });
      }
    }
    return diagnostics;
  }
}
//# sourceMappingURL=props-destructuring.js.map
