import type MagicString from 'magic-string';
import { type Node, type SourceFile, SyntaxKind } from 'ts-morph';
import type { ComponentInfo, DestructuredPropsInfo, PropsBindingInfo } from '../types';
import { findBodyNode } from '../utils';

/**
 * Find the body node for a component, handling both block bodies and
 * arrow expression bodies (which findBodyNode doesn't cover).
 */
function findComponentBody(sourceFile: SourceFile, component: ComponentInfo): Node | null {
  // Try block body first (function declarations, arrow with block body)
  const block = findBodyNode(sourceFile, component);
  if (block) return block;

  // Arrow expression body: find the node at the body position range
  const allNodes = sourceFile.getDescendants();
  for (const node of allNodes) {
    if (node.getStart() === component.bodyStart && node.getEnd() === component.bodyEnd) {
      return node;
    }
  }
  return null;
}

/**
 * Reverse destructured component props to preserve getter-based reactivity.
 *
 * Rewrites `function Card({ title, completed }: Props)` to
 * `function Card(__props: Props)` and replaces all body references to
 * `title` → `__props.title`, `completed` → `__props.completed`.
 *
 * Must run BEFORE reactivity analysis so downstream transforms see `__props.xxx`.
 */
export class PropsDestructuringTransformer {
  transform(source: MagicString, sourceFile: SourceFile, component: ComponentInfo): void {
    const { destructuredProps } = component;
    if (!destructuredProps) return;

    // Skip nested destructuring (unsupported)
    if (destructuredProps.hasNestedDestructuring) return;

    // Skip if no simple bindings to transform
    const simpleBindings = destructuredProps.bindings.filter((b) => !b.isRest);
    if (simpleBindings.length === 0 && !destructuredProps.hasRest) return;

    // Build the binding name → binding info map (excludes rest)
    const bindingMap = new Map<string, PropsBindingInfo>();
    for (const binding of simpleBindings) {
      bindingMap.set(binding.bindingName, binding);
    }

    // 1. Rewrite the parameter
    const newParam = `__props${destructuredProps.typeAnnotation ?? ''}`;
    source.overwrite(destructuredProps.paramStart, destructuredProps.paramEnd, newParam);

    // 2. Replace all references in the function body
    const bodyNode = findComponentBody(sourceFile, component);
    if (!bodyNode) return;

    this._replaceReferences(source, bodyNode, bindingMap);

    // 3. Insert rest destructuring at body top if needed
    if (destructuredProps.hasRest) {
      this._insertRestDestructuring(source, bodyNode, destructuredProps);
    }

    // 3. Update component info for downstream transforms
    component.propsParam = '__props';
    component.hasDestructuredProps = false;
  }

  private _replaceReferences(
    source: MagicString,
    bodyNode: Node,
    bindingMap: Map<string, PropsBindingInfo>,
  ): void {
    const identifiers = bodyNode.getDescendantsOfKind(SyntaxKind.Identifier);

    for (const id of identifiers) {
      const name = id.getText();
      const binding = bindingMap.get(name);
      if (!binding) continue;

      // Skip if not a reference to the destructured binding
      if (!this._isBindingReference(id, name)) continue;

      const parent = id.getParent();
      const replacement = this._buildReplacement(binding);

      // Handle shorthand property assignment: { title } → { title: __props.title }
      if (parent?.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
        source.overwrite(parent.getStart(), parent.getEnd(), `${name}: ${replacement}`);
        continue;
      }

      // Regular identifier replacement
      source.overwrite(id.getStart(), id.getEnd(), replacement);
    }
  }

  private _buildReplacement(binding: PropsBindingInfo): string {
    const access = `__props.${binding.propName}`;
    if (!binding.defaultValue) return access;
    return `(${access} ?? ${binding.defaultValue})`;
  }

  /**
   * Insert a rest destructuring statement at the top of the component body.
   * Named bindings are dropped (replaced with __props.xxx), rest variable
   * gets the real destructured rest object.
   *
   * Example: `const { title: __$drop_0, id: __$drop_1, ...rest } = __props;`
   */
  private _insertRestDestructuring(
    source: MagicString,
    bodyNode: Node,
    props: DestructuredPropsInfo,
  ): void {
    const restBinding = props.bindings.find((b) => b.isRest);
    if (!restBinding) return;

    const namedBindings = props.bindings.filter((b) => !b.isRest);
    const drops = namedBindings.map((b, i) => `${b.propName}: __$drop_${i}`);
    const pattern = [...drops, `...${restBinding.bindingName}`].join(', ');
    const stmt = `\n  const { ${pattern} } = __props;`;

    // Insert after the opening brace of the body block
    if (bodyNode.isKind(SyntaxKind.Block)) {
      source.appendRight(bodyNode.getStart() + 1, stmt);
    }
  }

  private _isBindingReference(id: Node, bindingName: string): boolean {
    const parent = id.getParent();
    if (!parent) return false;

    // Skip: right side of property access (obj.title → skip the `title`)
    if (parent.isKind(SyntaxKind.PropertyAccessExpression) && parent.getNameNode() === id) {
      return false;
    }

    // Skip: property name in object literal ({ title: value } → skip `title` key)
    if (parent.isKind(SyntaxKind.PropertyAssignment) && parent.getNameNode() === id) {
      return false;
    }

    // Skip: variable declaration name (const title = ...)
    if (parent.isKind(SyntaxKind.VariableDeclaration) && parent.getNameNode() === id) {
      return false;
    }

    // Skip: function parameter name
    if (parent.isKind(SyntaxKind.Parameter) && parent.getNameNode() === id) {
      return false;
    }

    // Skip: binding element name (const { title } = ...)
    if (parent.isKind(SyntaxKind.BindingElement) && parent.getNameNode() === id) {
      return false;
    }

    // Skip: function declaration name
    if (parent.isKind(SyntaxKind.FunctionDeclaration) && parent.getNameNode() === id) {
      return false;
    }

    // Skip: if shadowed by a declaration in an enclosing scope
    if (this._isShadowed(id, bindingName)) return false;

    return true;
  }

  /**
   * Check if an identifier is shadowed by a declaration in a scope between
   * the identifier and the component body root.
   */
  private _isShadowed(id: Node, bindingName: string): boolean {
    let current = id.getParent();
    // Walk up to find scopes that might shadow this binding
    while (current) {
      if (
        current.isKind(SyntaxKind.Block) ||
        current.isKind(SyntaxKind.ArrowFunction) ||
        current.isKind(SyntaxKind.FunctionDeclaration) ||
        current.isKind(SyntaxKind.FunctionExpression)
      ) {
        if (this._scopeDeclaresName(current, bindingName)) return true;
      }
      current = current.getParent();
    }
    return false;
  }

  private _scopeDeclaresName(scope: Node, name: string): boolean {
    // Check variable declarations
    const varDecls = scope.getDescendantsOfKind(SyntaxKind.VariableDeclaration);
    for (const decl of varDecls) {
      // Only check direct children of this scope's blocks (not nested scopes)
      if (decl.getName() === name && this._isDirectChild(scope, decl)) {
        return true;
      }
    }

    // Check function parameters (arrow functions, function expressions)
    if (
      scope.isKind(SyntaxKind.ArrowFunction) ||
      scope.isKind(SyntaxKind.FunctionDeclaration) ||
      scope.isKind(SyntaxKind.FunctionExpression)
    ) {
      const params = scope.getParameters();
      for (const param of params) {
        if (param.getName() === name) return true;
      }
    }

    return false;
  }

  /**
   * Check if a declaration is a direct child of the given scope
   * (not nested inside a deeper scope).
   */
  private _isDirectChild(scope: Node, decl: Node): boolean {
    let current = decl.getParent();
    while (current && current !== scope) {
      if (
        current.isKind(SyntaxKind.Block) ||
        current.isKind(SyntaxKind.ArrowFunction) ||
        current.isKind(SyntaxKind.FunctionDeclaration) ||
        current.isKind(SyntaxKind.FunctionExpression)
      ) {
        // Found an intermediate scope — decl is not a direct child
        return current === scope;
      }
      current = current.getParent();
    }
    return current === scope;
  }
}
