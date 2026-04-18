/**
 * Rewrites array-form `css()` / `variants()` call arguments to object form.
 *
 * Walks the source AST via `ts.createSourceFile`, edits byte ranges with
 * `magic-string`. Preserves unrelated code verbatim. Idempotent — running
 * twice produces identical output because the rewrite only targets array
 * literals of string shorthands.
 */

import MagicString from 'magic-string';
import ts from 'typescript';
import { generateStyleBlock } from './generator';

export interface RewriteResult {
  code: string;
  changed: boolean;
  tokensUsed: number;
  rewrittenSites: number;
}

const TARGET_CALLS: ReadonlySet<string> = new Set(['css', 'variants']);

export function rewriteSource(source: string, filename: string): RewriteResult {
  const sourceFile = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const ms = new MagicString(source);
  let rewrittenSites = 0;

  visit(sourceFile);

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isTargetCall(node)) {
      for (const arg of node.arguments) {
        if (ts.isObjectLiteralExpression(arg)) {
          rewriteObjectLiteral(arg);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  function rewriteObjectLiteral(obj: ts.ObjectLiteralExpression): void {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const init = prop.initializer;

      if (ts.isArrayLiteralExpression(init) && isShorthandArray(init)) {
        replaceArrayLiteral(init);
        continue;
      }

      if (ts.isObjectLiteralExpression(init)) {
        rewriteObjectLiteral(init);
      } else if (ts.isArrayLiteralExpression(init)) {
        for (const element of init.elements) {
          if (ts.isObjectLiteralExpression(element)) {
            rewriteObjectLiteral(element);
          }
        }
      }
    }
  }

  function replaceArrayLiteral(array: ts.ArrayLiteralExpression): void {
    const shorthands: string[] = [];
    for (const element of array.elements) {
      if (!ts.isStringLiteralLike(element)) {
        throw new TypeError(
          `Array element at ${filename}:${positionOf(element)} is not a string literal — cannot migrate.`,
        );
      }
      shorthands.push(element.text);
    }
    const replacement = generateStyleBlock(shorthands);
    ms.overwrite(array.getStart(sourceFile), array.getEnd(), replacement);
    rewrittenSites++;
  }

  function positionOf(node: ts.Node): string {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    return `${line + 1}:${character + 1}`;
  }

  const afterBody = ms.toString();
  const tokensUsed = countTokenReferences(afterBody) - countTokenReferences(source);

  if (rewrittenSites === 0) {
    return { code: source, changed: false, tokensUsed: 0, rewrittenSites: 0 };
  }

  const withImport = ensureTokenImport(afterBody, tokensUsed > 0);
  return {
    code: withImport,
    changed: withImport !== source,
    tokensUsed,
    rewrittenSites,
  };
}

function isTargetCall(call: ts.CallExpression): boolean {
  const { expression } = call;
  if (ts.isIdentifier(expression)) return TARGET_CALLS.has(expression.text);
  return false;
}

function isShorthandArray(array: ts.ArrayLiteralExpression): boolean {
  if (array.elements.length === 0) return false;
  return array.elements.every((el) => ts.isStringLiteralLike(el));
}

function countTokenReferences(code: string): number {
  return (code.match(/\btoken\./g) ?? []).length;
}

/**
 * Ensure `token` is imported from `@vertz/ui`. If there is already a named
 * import from `@vertz/ui`, add `token` to its clause. Otherwise insert a new
 * import statement after the last top-of-file import.
 */
function ensureTokenImport(source: string, needsToken: boolean): string {
  if (!needsToken) return source;

  const sourceFile = ts.createSourceFile(
    '_.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  let existingVertzUiImport: ts.ImportDeclaration | null = null;
  let lastImport: ts.ImportDeclaration | null = null;

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    lastImport = stmt;
    const specifier = stmt.moduleSpecifier;
    if (ts.isStringLiteral(specifier) && specifier.text === '@vertz/ui') {
      existingVertzUiImport = stmt;
    }
  }

  if (existingVertzUiImport) {
    const clause = existingVertzUiImport.importClause;
    const namedBindings = clause?.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings) && !clause.isTypeOnly) {
      const tokenSpec = namedBindings.elements.find((el) => {
        const original = el.propertyName?.text ?? el.name.text;
        return original === 'token' && !el.isTypeOnly;
      });
      if (tokenSpec) {
        if (tokenSpec.propertyName === undefined) return source;
        throw new TypeError(
          `@vertz/ui imports 'token' aliased as '${tokenSpec.name.text}' — migration script uses unaliased 'token'. Resolve manually.`,
        );
      }
      return insertTokenInNamedImports(source, namedBindings);
    }
  }

  const insertPos = lastImport ? lastImport.getEnd() : 0;
  const prefix = lastImport ? '\n' : '';
  const suffix = lastImport ? '' : '\n';
  return (
    source.slice(0, insertPos) +
    `${prefix}import { token } from '@vertz/ui';${suffix}` +
    source.slice(insertPos)
  );
}

function insertTokenInNamedImports(source: string, named: ts.NamedImports): string {
  const elements = named.elements;
  if (elements.length === 0) {
    const openBrace = named.getStart() + 1;
    return source.slice(0, openBrace) + ' token ' + source.slice(openBrace);
  }
  const sorted = [...elements.map((el) => el.name.text), 'token'].sort();
  const start = named.getStart();
  const end = named.getEnd();
  const newClause = `{ ${sorted.join(', ')} }`;
  return source.slice(0, start) + newClause + source.slice(end);
}
