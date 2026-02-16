import type { AppIR, MiddlewareIR, RouteIR, SchemaRef } from '../ir/types';
import { BaseGenerator } from './base-generator';
export interface OpenAPIDocument {
  openapi: '3.1.0';
  info: OpenAPIInfo;
  servers: OpenAPIServer[];
  paths: Record<string, OpenAPIPathItem>;
  components: {
    schemas: Record<string, JSONSchemaObject>;
  };
  tags: OpenAPITag[];
}
export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
}
export interface OpenAPIServer {
  url: string;
  description?: string;
}
export interface OpenAPITag {
  name: string;
  description?: string;
}
export interface OpenAPIPathItem {
  [method: string]: OpenAPIOperation | undefined;
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  head?: OpenAPIOperation;
  options?: OpenAPIOperation;
}
export interface OpenAPIOperation {
  operationId: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
}
export interface OpenAPIParameter {
  name: string;
  in: 'path' | 'query' | 'header';
  required: boolean;
  schema: JSONSchemaObject;
  description?: string;
}
export interface OpenAPIRequestBody {
  required: boolean;
  content: {
    'application/json': {
      schema: JSONSchemaObject;
    };
  };
}
export interface OpenAPIResponse {
  description: string;
  content?: {
    'application/json': {
      schema: JSONSchemaObject;
    };
  };
}
export type JSONSchemaObject = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JSONSchemaObject>;
  required?: string[];
  items?: JSONSchemaObject;
  oneOf?: JSONSchemaObject[];
  allOf?: JSONSchemaObject[];
  anyOf?: JSONSchemaObject[];
  discriminator?: {
    propertyName: string;
    mapping?: Record<string, string>;
  };
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  format?: string;
  description?: string;
  default?: unknown;
  $defs?: Record<string, JSONSchemaObject>;
  additionalProperties?: boolean | JSONSchemaObject;
  [key: string]: unknown;
};
export declare class OpenAPIGenerator extends BaseGenerator {
  readonly name = 'openapi';
  generate(ir: AppIR, outputDir: string): Promise<void>;
  buildDocument(ir: AppIR): OpenAPIDocument;
  private buildOperation;
  private buildResponses;
  private resolveAndLift;
  private getSuccessStatusCode;
  convertPath(routePath: string): string;
  buildParameters(route: RouteIR, middlewareMap: Map<string, MiddlewareIR>): OpenAPIParameter[];
  resolveSchemaRef(schemaRef: SchemaRef): JSONSchemaObject;
  private extractParamsFromSchema;
  private extractHeaderParams;
  liftDefsToComponents(
    schema: JSONSchemaObject,
    components: Record<string, JSONSchemaObject>,
  ): JSONSchemaObject;
  private rewriteRefs;
  collectTags(ir: AppIR): OpenAPITag[];
}
//# sourceMappingURL=openapi-generator.d.ts.map
