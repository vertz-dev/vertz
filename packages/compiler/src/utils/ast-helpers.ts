import {
  type CallExpression,
  type Expression,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';

export function findCallExpressions(
  file: SourceFile,
  objectName: string,
  methodName: string,
): CallExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression();
    if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) return false;
    const obj = expr.getExpression();
    const method = expr.getName();
    return obj.isKind(SyntaxKind.Identifier) && obj.getText() === objectName && method === methodName;
  });
}

export function findMethodCallsOnVariable(
  file: SourceFile,
  variableName: string,
  methodName: string,
): CallExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression();
    if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) return false;
    const obj = expr.getExpression();
    const method = expr.getName();
    if (!obj.isKind(SyntaxKind.Identifier) || obj.getText() !== variableName || method !== methodName) {
      return false;
    }
    const defs = obj.getDefinitionNodes();
    return defs.some((d) => d.isKind(SyntaxKind.VariableDeclaration));
  });
}

export function extractObjectLiteral(
  callExpr: CallExpression,
  argIndex: number,
): ObjectLiteralExpression | null {
  const args = callExpr.getArguments();
  if (argIndex >= args.length) return null;
  const arg = args[argIndex]!;
  if (arg.isKind(SyntaxKind.ObjectLiteralExpression)) return arg;
  return null;
}

export function getPropertyValue(
  obj: ObjectLiteralExpression,
  key: string,
): Expression | null {
  for (const prop of obj.getProperties()) {
    if (prop.isKind(SyntaxKind.PropertyAssignment) && prop.getName() === key) {
      return prop.getInitializerOrThrow();
    }
    if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment) && prop.getName() === key) {
      return prop.getNameNode();
    }
  }
  return null;
}

export function getProperties(
  obj: ObjectLiteralExpression,
): { name: string; value: Expression }[] {
  const result: { name: string; value: Expression }[] = [];
  for (const prop of obj.getProperties()) {
    if (prop.isKind(SyntaxKind.PropertyAssignment)) {
      result.push({ name: prop.getName(), value: prop.getInitializerOrThrow() });
    } else if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      result.push({ name: prop.getName(), value: prop.getNameNode() });
    }
  }
  return result;
}

export function getStringValue(expr: Expression): string | null {
  if (expr.isKind(SyntaxKind.StringLiteral)) {
    return expr.getLiteralValue();
  }
  if (expr.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return expr.getLiteralValue();
  }
  return null;
}

export function getBooleanValue(expr: Expression): boolean | null {
  if (expr.isKind(SyntaxKind.TrueKeyword)) return true;
  if (expr.isKind(SyntaxKind.FalseKeyword)) return false;
  return null;
}

export function getNumberValue(expr: Expression): number | null {
  if (expr.isKind(SyntaxKind.NumericLiteral)) {
    return expr.getLiteralValue();
  }
  if (expr.isKind(SyntaxKind.PrefixUnaryExpression)) {
    const operator = expr.getOperatorToken();
    const operand = expr.getOperand();
    if (operator === SyntaxKind.MinusToken && operand.isKind(SyntaxKind.NumericLiteral)) {
      return -operand.getLiteralValue();
    }
  }
  return null;
}

export function getArrayElements(expr: Expression): Expression[] {
  if (expr.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return expr.getElements();
  }
  return [];
}

export function getVariableNameForCall(callExpr: CallExpression): string | null {
  const parent = callExpr.getParent();
  if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
    return parent.getName();
  }
  return null;
}

export function getSourceLocation(node: Node): {
  sourceFile: string;
  sourceLine: number;
  sourceColumn: number;
} {
  const file = node.getSourceFile();
  const pos = node.getStart();
  const { line, column } = file.getLineAndColumnAtPos(pos);
  return {
    sourceFile: file.getFilePath(),
    sourceLine: line,
    sourceColumn: column,
  };
}
