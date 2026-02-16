import {
  type CallExpression,
  type Expression,
  type Node,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'ts-morph';
import type { SourceLocation } from '../ir/types';
export declare function findCallExpressions(
  file: SourceFile,
  objectName: string,
  methodName: string,
): CallExpression[];
export declare function findMethodCallsOnVariable(
  file: SourceFile,
  variableName: string,
  methodName: string,
): CallExpression[];
export declare function extractObjectLiteral(
  callExpr: CallExpression,
  argIndex: number,
): ObjectLiteralExpression | null;
export declare function getPropertyValue(
  obj: ObjectLiteralExpression,
  key: string,
): Expression | null;
export declare function getProperties(obj: ObjectLiteralExpression): {
  name: string;
  value: Expression;
}[];
export declare function getStringValue(expr: Expression): string | null;
export declare function getBooleanValue(expr: Expression): boolean | null;
export declare function getNumberValue(expr: Expression): number | null;
export declare function getArrayElements(expr: Expression): Expression[];
export declare function getVariableNameForCall(callExpr: CallExpression): string | null;
export declare function getSourceLocation(node: Node): SourceLocation;
//# sourceMappingURL=ast-helpers.d.ts.map
