export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface ParsedSpec {
  version: '3.0' | '3.1';
  info: {
    title: string;
    version: string;
  };
  resources: ParsedResource[];
  schemas: ParsedSchema[];
  securitySchemes: ParsedSecurityScheme[];
}

export interface ParsedResource {
  name: string;
  identifier: string;
  operations: ParsedOperation[];
}

export interface ParsedOperation {
  operationId: string;
  methodName: string;
  /** PascalCase prefix for generated type names (shorter than operationId for path-heavy IDs). */
  typePrefix?: string;
  method: HttpMethod;
  path: string;
  pathParams: ParsedParameter[];
  queryParams: ParsedParameter[];
  requestBody?: ParsedSchema;
  response?: ParsedSchema;
  responseStatus: number;
  tags: string[];
  security?: OperationSecurity;
  streamingFormat?: 'sse' | 'ndjson';
  jsonResponse?: ParsedSchema;
}

export interface OperationSecurity {
  required: boolean;
  schemes: string[];
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

export type ParsedSecurityScheme =
  | { type: 'bearer'; name: string; description?: string }
  | { type: 'basic'; name: string; description?: string }
  | {
      type: 'apiKey';
      name: string;
      in: 'header' | 'query' | 'cookie';
      paramName: string;
      description?: string;
    }
  | { type: 'oauth2'; name: string; flows: ParsedOAuthFlows; description?: string };

export interface ParsedOAuthFlows {
  authorizationCode?: {
    authorizationUrl: string;
    tokenUrl: string;
    scopes: Record<string, string>;
  };
  clientCredentials?: {
    tokenUrl: string;
    scopes: Record<string, string>;
  };
}
