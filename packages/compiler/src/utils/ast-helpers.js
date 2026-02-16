import { SyntaxKind } from 'ts-morph';

function matchPropertyAccess(call, objectName, methodName) {
  const expr = call.getExpression();
  if (!expr.isKind(SyntaxKind.PropertyAccessExpression)) return null;
  const obj = expr.getExpression();
  if (
    !obj.isKind(SyntaxKind.Identifier) ||
    obj.getText() !== objectName ||
    expr.getName() !== methodName
  ) {
    return null;
  }
  return expr;
}
export function findCallExpressions(file, objectName, methodName) {
  return file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => matchPropertyAccess(call, objectName, methodName) !== null);
}
export function findMethodCallsOnVariable(file, variableName, methodName) {
  return file.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const access = matchPropertyAccess(call, variableName, methodName);
    if (!access) return false;
    const obj = access.getExpression();
    return obj.getDefinitionNodes().some((d) => d.isKind(SyntaxKind.VariableDeclaration));
  });
}
export function extractObjectLiteral(callExpr, argIndex) {
  const arg = callExpr.getArguments()[argIndex];
  if (arg?.isKind(SyntaxKind.ObjectLiteralExpression)) return arg;
  return null;
}
export function getPropertyValue(obj, key) {
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
export function getProperties(obj) {
  const result = [];
  for (const prop of obj.getProperties()) {
    if (prop.isKind(SyntaxKind.PropertyAssignment)) {
      result.push({ name: prop.getName(), value: prop.getInitializerOrThrow() });
    } else if (prop.isKind(SyntaxKind.ShorthandPropertyAssignment)) {
      result.push({ name: prop.getName(), value: prop.getNameNode() });
    }
  }
  return result;
}
export function getStringValue(expr) {
  if (
    expr.isKind(SyntaxKind.StringLiteral) ||
    expr.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)
  ) {
    return expr.getLiteralValue();
  }
  return null;
}
export function getBooleanValue(expr) {
  if (expr.isKind(SyntaxKind.TrueKeyword)) return true;
  if (expr.isKind(SyntaxKind.FalseKeyword)) return false;
  return null;
}
export function getNumberValue(expr) {
  if (expr.isKind(SyntaxKind.NumericLiteral)) {
    return expr.getLiteralValue();
  }
  if (expr.isKind(SyntaxKind.PrefixUnaryExpression)) {
    const operator = expr.getOperatorToken();
    const operand = expr.getOperand();
    if (operand.isKind(SyntaxKind.NumericLiteral)) {
      if (operator === SyntaxKind.MinusToken) return -operand.getLiteralValue();
      if (operator === SyntaxKind.PlusToken) return operand.getLiteralValue();
    }
  }
  return null;
}
export function getArrayElements(expr) {
  if (expr.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return expr.getElements();
  }
  return [];
}
export function getVariableNameForCall(callExpr) {
  const parent = callExpr.getParent();
  if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
    return parent.getName();
  }
  return null;
}
export function getSourceLocation(node) {
  const file = node.getSourceFile();
  const pos = node.getStart();
  const { line, column } = file.getLineAndColumnAtPos(pos);
  return {
    sourceFile: file.getFilePath(),
    sourceLine: line,
    sourceColumn: column,
  };
}
//# sourceMappingURL=ast-helpers.js.map
