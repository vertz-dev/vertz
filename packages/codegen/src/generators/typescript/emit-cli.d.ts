import type { CodegenIR, CodegenModule, CodegenOperation, GeneratedFile } from '../../types';
export declare function emitCommandDefinition(op: CodegenOperation): string;
export declare function emitModuleCommands(module: CodegenModule): string;
export declare function emitManifestFile(ir: CodegenIR): GeneratedFile;
export interface BinEntryPointOptions {
  cliName: string;
  cliVersion: string;
}
export declare function emitBinEntryPoint(options: BinEntryPointOptions): GeneratedFile;
export interface CLIPackageOptions {
  packageName: string;
  packageVersion?: string;
  cliName: string;
}
export declare function scaffoldCLIPackageJson(options: CLIPackageOptions): GeneratedFile;
export declare function scaffoldCLIRootIndex(): GeneratedFile;
//# sourceMappingURL=emit-cli.d.ts.map
