import type {
  CodegenAuth,
  CodegenIR,
  CodegenModule,
  CodegenOperation,
  FileFragment,
  GeneratedFile,
} from '../../types';
export declare function emitSDKConfig(auth: CodegenAuth): FileFragment;
export declare function emitAuthStrategyBuilder(auth: CodegenAuth): FileFragment;
export declare function emitOperationMethod(op: CodegenOperation): FileFragment;
export declare function emitStreamingMethod(op: CodegenOperation): FileFragment;
export declare function emitModuleFile(module: CodegenModule): GeneratedFile;
export declare function emitClientFile(ir: CodegenIR): GeneratedFile;
//# sourceMappingURL=emit-client.d.ts.map
