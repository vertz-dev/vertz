import { FormatSchema } from './format-schema';
export declare class IsoDateSchema extends FormatSchema {
  protected _errorMessage: string;
  protected _validate(value: string): boolean;
  protected _jsonSchemaExtra(): Record<string, unknown>;
}
export declare class IsoTimeSchema extends FormatSchema {
  protected _errorMessage: string;
  protected _validate(value: string): boolean;
  protected _jsonSchemaExtra(): Record<string, unknown>;
}
export declare class IsoDatetimeSchema extends FormatSchema {
  protected _errorMessage: string;
  protected _validate(value: string): boolean;
  protected _jsonSchemaExtra(): Record<string, unknown>;
}
export declare class IsoDurationSchema extends FormatSchema {
  protected _errorMessage: string;
  protected _validate(value: string): boolean;
  protected _jsonSchemaExtra(): Record<string, unknown>;
}
//# sourceMappingURL=iso.d.ts.map
