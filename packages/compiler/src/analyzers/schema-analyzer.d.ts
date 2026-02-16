import type { Expression, SourceFile } from 'ts-morph';
import type { InlineSchemaRef, NamedSchemaRef, SchemaIR, SchemaNameParts } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface SchemaAnalyzerResult {
  schemas: SchemaIR[];
}
export declare class SchemaAnalyzer extends BaseAnalyzer<SchemaAnalyzerResult> {
  analyze(): Promise<SchemaAnalyzerResult>;
}
export declare function parseSchemaName(name: string): SchemaNameParts;
export declare function isSchemaExpression(_file: SourceFile, expr: Expression): boolean;
export declare function extractSchemaId(expr: Expression): string | null;
export declare function isSchemaFile(file: SourceFile): boolean;
export declare function createNamedSchemaRef(
  schemaName: string,
  sourceFile: string,
): NamedSchemaRef;
export declare function createInlineSchemaRef(sourceFile: string): InlineSchemaRef;
//# sourceMappingURL=schema-analyzer.d.ts.map
