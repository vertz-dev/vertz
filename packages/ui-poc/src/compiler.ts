/**
 * Minimal compiler transform for @vertz/ui POC.
 *
 * Uses ts-morph to parse .tsx source and MagicString for surgical
 * string replacements with source map preservation.
 *
 * Validates:
 * - let -> signal() transformation
 * - const -> computed() transformation for reactive dependencies
 * - JSX expression -> reactive getter wrapping
 * - Event handler mutation -> signal update
 * - Two-pass taint analysis (transitive reactivity)
 */

import MagicString from 'magic-string';
import { type Node, Project, type SourceFile, SyntaxKind, VariableDeclarationKind } from 'ts-morph';

export interface TransformResult {
  code: string;
  map: ReturnType<MagicString['generateMap']>;
}

export function transform(source: string, filename = 'input.tsx'): TransformResult {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: 4, // JsxPreserve
      target: 99, // ESNext
      module: 99, // ESNext
      strict: true,
    },
  });

  const sourceFile = project.createSourceFile(filename, source);
  const s = new MagicString(source);

  const components = findComponentFunctions(sourceFile);

  for (const component of components) {
    transformComponent(component, s);
  }

  if (s.hasChanged()) {
    s.prepend('import { signal as __signal, computed as __computed } from "@vertz/ui/runtime";\n');
  }

  return {
    code: s.toString(),
    map: s.generateMap({ hires: true }),
  };
}

// ---- Types ----

interface ComponentInfo {
  name: string;
  reactiveVars: Map<string, VarInfo>;
  derivedConsts: Map<string, ConstInfo>;
}

interface VarInfo {
  name: string;
  declStart: number;
  declEnd: number;
  initText: string;
  reads: { start: number; end: number }[];
  writes: WritePos[];
}

interface WritePos {
  start: number;
  end: number;
  operator: string;
  rhsText?: string;
}

interface ConstInfo {
  name: string;
  declStart: number;
  declEnd: number;
  initText: string;
  dependsOn: Set<string>; // names of lets/consts this references
  reads: { start: number; end: number }[];
}

// ---- Component Detection ----

function findComponentFunctions(sourceFile: SourceFile): ComponentInfo[] {
  const components: ComponentInfo[] = [];

  for (const fn of sourceFile.getFunctions()) {
    const name = fn.getName();
    if (!name || !/^[A-Z]/.test(name)) continue;
    const body = fn.getBody();
    if (!body || !containsJsx(body)) continue;
    components.push(analyzeComponentBody(name, body));
  }

  for (const varDecl of sourceFile.getVariableDeclarations()) {
    const name = varDecl.getName();
    if (!/^[A-Z]/.test(name)) continue;
    const init = varDecl.getInitializer();
    if (!init) continue;
    if (
      init.getKind() !== SyntaxKind.ArrowFunction &&
      init.getKind() !== SyntaxKind.FunctionExpression
    )
      continue;
    if (!containsJsx(init)) continue;

    const bodyNode =
      init.getKind() === SyntaxKind.ArrowFunction
        ? (
            init as ReturnType<typeof varDecl.getInitializerIfKind<SyntaxKind.ArrowFunction>>
          )?.getBody()
        : (
            init as ReturnType<typeof varDecl.getInitializerIfKind<SyntaxKind.FunctionExpression>>
          )?.getBody();

    if (!bodyNode) continue;
    components.push(analyzeComponentBody(name, bodyNode));
  }

  return components;
}

function containsJsx(node: Node): boolean {
  return (
    node.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0 ||
    node.getDescendantsOfKind(SyntaxKind.JsxFragment).length > 0
  );
}

// ---- Two-Pass Taint Analysis ----

function analyzeComponentBody(name: string, body: Node): ComponentInfo {
  // Pass 1: Collect ALL let and const declarations
  const allLets = new Map<string, { declStart: number; declEnd: number; initText: string }>();
  const allConsts = new Map<
    string,
    { declStart: number; declEnd: number; initText: string; dependsOn: Set<string> }
  >();

  const varStatements = body.getDescendantsOfKind(SyntaxKind.VariableStatement);

  for (const stmt of varStatements) {
    const declList = stmt.getDeclarationList();
    const kind = declList.getDeclarationKind();

    for (const decl of declList.getDeclarations()) {
      const varName = decl.getName();
      const init = decl.getInitializer();
      if (!init) continue;

      if (kind === VariableDeclarationKind.Let) {
        allLets.set(varName, {
          declStart: stmt.getStart(),
          declEnd: stmt.getEnd(),
          initText: init.getText(),
        });
      } else if (kind === VariableDeclarationKind.Const) {
        // Find which other vars this const's initializer references
        const initText = init.getText();
        const deps = new Set<string>();
        for (const letName of allLets.keys()) {
          if (referencesName(initText, letName)) {
            deps.add(letName);
          }
        }
        for (const constName of allConsts.keys()) {
          if (referencesName(initText, constName)) {
            deps.add(constName);
          }
        }
        allConsts.set(varName, {
          declStart: stmt.getStart(),
          declEnd: stmt.getEnd(),
          initText,
          dependsOn: deps,
        });
      }
    }
  }

  // Pass 2: Find names referenced in JSX context
  const jsxReferencedNames = findNamesInJsx(body);

  // Taint propagation: a let is reactive if it's in JSX OR
  // if a const that references it is in JSX (transitively)
  const reactiveNames = new Set<string>();

  // Seed: names directly in JSX
  for (const n of jsxReferencedNames) {
    if (allLets.has(n)) reactiveNames.add(n);
    if (allConsts.has(n)) reactiveNames.add(n);
  }

  // Propagate: if a const is reactive, all its dependencies are reactive
  let changed = true;
  while (changed) {
    changed = false;
    for (const [constName, constInfo] of allConsts) {
      if (reactiveNames.has(constName)) {
        for (const dep of constInfo.dependsOn) {
          if (!reactiveNames.has(dep)) {
            reactiveNames.add(dep);
            changed = true;
          }
        }
      }
    }
    // Also: if a const depends on a reactive name, the const becomes reactive
    for (const [constName, constInfo] of allConsts) {
      if (!reactiveNames.has(constName)) {
        for (const dep of constInfo.dependsOn) {
          if (reactiveNames.has(dep)) {
            reactiveNames.add(constName);
            changed = true;
            break;
          }
        }
      }
    }
  }

  // Build reactive vars map
  const reactiveVars = new Map<string, VarInfo>();
  for (const [varName, info] of allLets) {
    if (!reactiveNames.has(varName)) continue;
    reactiveVars.set(varName, {
      name: varName,
      declStart: info.declStart,
      declEnd: info.declEnd,
      initText: info.initText,
      reads: findReadPositions(varName, body),
      writes: findWritePositions(varName, body),
    });
  }

  // Build derived consts map
  const derivedConsts = new Map<string, ConstInfo>();
  for (const [constName, info] of allConsts) {
    if (!reactiveNames.has(constName)) continue;
    // Only transform consts that depend on reactive names
    const hasReactiveDep = [...info.dependsOn].some((d) => reactiveNames.has(d));
    if (!hasReactiveDep) continue;

    derivedConsts.set(constName, {
      name: constName,
      declStart: info.declStart,
      declEnd: info.declEnd,
      initText: info.initText,
      dependsOn: info.dependsOn,
      reads: findReadPositions(constName, body),
    });
  }

  return { name, reactiveVars, derivedConsts };
}

/** Check if text contains a word-boundary reference to name */
function referencesName(text: string, name: string): boolean {
  const re = new RegExp(`\\b${name}\\b`);
  return re.test(text);
}

/** Find all variable names referenced in JSX expressions and attributes */
function findNamesInJsx(body: Node): Set<string> {
  const names = new Set<string>();

  const jsxExpressions = body.getDescendantsOfKind(SyntaxKind.JsxExpression);
  for (const expr of jsxExpressions) {
    for (const id of expr.getDescendantsOfKind(SyntaxKind.Identifier)) {
      names.add(id.getText());
    }
  }

  const jsxAttrs = body.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of jsxAttrs) {
    const init = attr.getInitializer();
    if (init) {
      for (const id of init.getDescendantsOfKind(SyntaxKind.Identifier)) {
        names.add(id.getText());
      }
    }
  }

  return names;
}

// ---- Position Finding ----

function findReadPositions(name: string, body: Node): { start: number; end: number }[] {
  const positions: { start: number; end: number }[] = [];

  for (const id of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== name) continue;
    const parent = id.getParent();
    if (!parent) continue;

    // Skip declaration
    if (parent.getKind() === SyntaxKind.VariableDeclaration) continue;

    // Skip LHS of assignment
    if (parent.getKind() === SyntaxKind.BinaryExpression) {
      const children = parent.getChildren();
      if (children[0] === id) {
        const op = children[1]?.getText();
        if (op && ['=', '+=', '-=', '*=', '/='].includes(op)) continue;
      }
    }

    // Skip prefix/postfix unary
    if (
      parent.getKind() === SyntaxKind.PrefixUnaryExpression ||
      parent.getKind() === SyntaxKind.PostfixUnaryExpression
    ) {
      continue;
    }

    positions.push({ start: id.getStart(), end: id.getEnd() });
  }

  return positions;
}

function findWritePositions(name: string, body: Node): WritePos[] {
  const positions: WritePos[] = [];

  for (const id of body.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== name) continue;
    const parent = id.getParent();
    if (!parent) continue;

    if (parent.getKind() === SyntaxKind.BinaryExpression) {
      const children = parent.getChildren();
      if (children[0] === id && children.length >= 3) {
        const op = children[1]?.getText() ?? '';
        if (['=', '+=', '-=', '*=', '/='].includes(op)) {
          positions.push({
            start: parent.getStart(),
            end: parent.getEnd(),
            operator: op,
            rhsText: children[2]?.getText() ?? '',
          });
        }
      }
    }

    if (parent.getKind() === SyntaxKind.PrefixUnaryExpression) {
      const txt = parent.getText();
      const op = txt.startsWith('++') ? '++' : txt.startsWith('--') ? '--' : null;
      if (op) {
        positions.push({ start: parent.getStart(), end: parent.getEnd(), operator: op });
      }
    }

    if (parent.getKind() === SyntaxKind.PostfixUnaryExpression) {
      const txt = parent.getText();
      const op = txt.endsWith('++') ? '++' : txt.endsWith('--') ? '--' : null;
      if (op) {
        positions.push({ start: parent.getStart(), end: parent.getEnd(), operator: op });
      }
    }
  }

  return positions;
}

// ---- Transform ----

function transformComponent(component: ComponentInfo, s: MagicString): void {
  const reactiveLetNames = new Set(component.reactiveVars.keys());
  const reactiveConstNames = new Set(component.derivedConsts.keys());

  // Transform let declarations -> signal()
  for (const [name, info] of component.reactiveVars) {
    const sigName = `__${name}`;

    s.overwrite(info.declStart, info.declEnd, `const ${sigName} = __signal(${info.initText});`);

    // Transform reads (descending order)
    for (const pos of [...info.reads].sort((a, b) => b.start - a.start)) {
      s.overwrite(pos.start, pos.end, `${sigName}.get()`);
    }

    // Transform writes (descending order)
    for (const pos of [...info.writes].sort((a, b) => b.start - a.start)) {
      if (pos.operator === '=') {
        // Rewrite references in the RHS too
        let rhs = pos.rhsText!;
        for (const rn of reactiveLetNames) {
          rhs = rhs.replace(new RegExp(`\\b${rn}\\b`, 'g'), `__${rn}.get()`);
        }
        for (const cn of reactiveConstNames) {
          rhs = rhs.replace(new RegExp(`\\b${cn}\\b`, 'g'), `__${cn}.get()`);
        }
        s.overwrite(pos.start, pos.end, `${sigName}.set(${rhs})`);
      } else if (pos.operator === '++') {
        s.overwrite(pos.start, pos.end, `${sigName}.update(v => v + 1)`);
      } else if (pos.operator === '--') {
        s.overwrite(pos.start, pos.end, `${sigName}.update(v => v - 1)`);
      } else if (pos.operator === '+=') {
        s.overwrite(pos.start, pos.end, `${sigName}.update(v => v + (${pos.rhsText}))`);
      } else if (pos.operator === '-=') {
        s.overwrite(pos.start, pos.end, `${sigName}.update(v => v - (${pos.rhsText}))`);
      }
    }
  }

  // Transform derived consts -> computed()
  for (const [name, info] of component.derivedConsts) {
    const compName = `__${name}`;

    // Rewrite initializer to use signal getters
    let body = info.initText;
    for (const rn of reactiveLetNames) {
      body = body.replace(new RegExp(`\\b${rn}\\b`, 'g'), `__${rn}.get()`);
    }
    for (const cn of reactiveConstNames) {
      if (cn !== name) {
        // avoid self-reference
        body = body.replace(new RegExp(`\\b${cn}\\b`, 'g'), `__${cn}.get()`);
      }
    }

    s.overwrite(info.declStart, info.declEnd, `const ${compName} = __computed(() => ${body});`);

    // Transform reads (descending)
    for (const pos of [...info.reads].sort((a, b) => b.start - a.start)) {
      s.overwrite(pos.start, pos.end, `${compName}.get()`);
    }
  }
}
