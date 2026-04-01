export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ParsedSpec {
  version: '3.0' | '3.1';
  info: {
    title: string;
    version: string;
  };
  resources: ParsedResource[];
  schemas: ParsedSchema[];
}

export interface ParsedResource {
  name: string;
  identifier: string;
  operations: ParsedOperation[];
}

export interface ParsedOperation {
  operationId: string;
  methodName: string;
  method: HttpMethod;
  path: string;
  pathParams: ParsedParameter[];
  queryParams: ParsedParameter[];
  requestBody?: ParsedSchema;
  response?: ParsedSchema;
  responseStatus: number;
  tags: string[];
}

export interface ParsedParameter {
  name: string;
  required: boolean;
  schema: Record<string, unknown>;
}

export interface ParsedSchema {
  name?: string;
  jsonSchema: Record<string, unknown>;
}
