import type {
  CodegenModule,
  CodegenOperation,
  CodegenSchema,
  FileFragment,
  GeneratedFile,
} from '../../types';
export declare function emitInterfaceFromSchema(schema: CodegenSchema): FileFragment;
export declare function emitOperationInputType(op: CodegenOperation): FileFragment;
export declare function emitOperationResponseType(op: CodegenOperation): FileFragment;
export declare function emitStreamingEventType(op: CodegenOperation): FileFragment;
export declare function emitModuleTypesFile(
  module: CodegenModule,
  schemas: CodegenSchema[],
): GeneratedFile;
export declare function emitSharedTypesFile(schemas: CodegenSchema[]): GeneratedFile;
//# sourceMappingURL=emit-types.d.ts.map
