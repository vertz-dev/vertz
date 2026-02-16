import type { CodegenIR, CodegenSchema, GeneratedFile } from '../../types';
export declare function emitSchemaReExports(schemas: CodegenSchema[]): GeneratedFile;
export interface PackageOptions {
  packageName: string;
  packageVersion?: string;
}
export declare function emitBarrelIndex(ir: CodegenIR): GeneratedFile;
export declare function emitPackageJson(ir: CodegenIR, options: PackageOptions): GeneratedFile;
//# sourceMappingURL=emit-sdk.d.ts.map
