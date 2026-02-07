import { writeFile } from 'node:fs/promises';
import type { AppIR, HttpMethod, MiddlewareIR, RouteIR, SchemaIR, SchemaRef } from '../ir/types';
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
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  enum?: (string | number | boolean | null)[];
  const?: string | number | boolean | null;
  format?: string;
  description?: string;
  default?: unknown;
  $defs?: Record<string, JSONSchemaObject>;
  additionalProperties?: boolean | JSONSchemaObject;
  [key: string]: unknown;
};

export class OpenAPIGenerator extends BaseGenerator {
  readonly name = 'openapi';

  async generate(ir: AppIR, outputDir: string): Promise<void> {
    const doc = this.buildDocument(ir);
    const outputPath = this.resolveOutputPath(outputDir, 'openapi.json');
    await writeFile(outputPath, JSON.stringify(doc, null, 2));
  }

  buildDocument(ir: AppIR): OpenAPIDocument {
    const version = ir.app.version ?? this.config.compiler.openapi.info.version;
    const namedSchemas = new Map<string, SchemaIR>();
    for (const schema of ir.schemas) {
      if (schema.isNamed && schema.id) {
        namedSchemas.set(schema.name, schema);
      }
    }

    const middlewareMap = new Map<string, MiddlewareIR>();
    for (const mw of ir.middleware) {
      middlewareMap.set(mw.name, mw);
    }

    const paths: Record<string, OpenAPIPathItem> = {};
    const components: Record<string, JSONSchemaObject> = {};

    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          const pathKey = this.convertPath(route.fullPath);
          if (!paths[pathKey]) paths[pathKey] = {};
          const method = route.method.toLowerCase();
          const operation = this.buildOperation(route, namedSchemas, middlewareMap, components);
          (paths[pathKey] as Record<string, OpenAPIOperation>)[method] = operation;
        }
      }
    }

    // Add named schemas to components
    for (const schema of ir.schemas) {
      if (schema.isNamed && schema.id && schema.jsonSchema) {
        components[schema.id] = schema.jsonSchema as JSONSchemaObject;
      }
    }

    return {
      openapi: '3.1.0',
      info: {
        title: this.config.compiler.openapi.info.title,
        version,
        ...(this.config.compiler.openapi.info.description
          ? { description: this.config.compiler.openapi.info.description }
          : {}),
      },
      servers: [{ url: ir.app.basePath || '/' }],
      paths,
      components: { schemas: components },
      tags: this.collectTags(ir),
    };
  }

  private buildOperation(
    route: RouteIR,
    namedSchemas: Map<string, SchemaIR>,
    middlewareMap: Map<string, MiddlewareIR>,
    _components: Record<string, JSONSchemaObject>,
  ): OpenAPIOperation {
    const operation: OpenAPIOperation = {
      operationId: route.operationId,
      tags: route.tags,
      parameters: this.buildParameters(route, middlewareMap),
      responses: this.buildResponses(route, namedSchemas),
    };

    if (route.description) {
      operation.description = route.description;
    }

    if (route.body) {
      const schema = this.resolveSchemaRef(route.body, namedSchemas);
      operation.requestBody = {
        required: true,
        content: { 'application/json': { schema } },
      };
    }

    return operation;
  }

  private buildResponses(
    route: RouteIR,
    namedSchemas: Map<string, SchemaIR>,
  ): Record<string, OpenAPIResponse> {
    if (!route.response) {
      if (route.method === 'DELETE') {
        return { '204': { description: 'No Content' } };
      }
      return { '200': { description: 'OK' } };
    }

    const statusCode = this.getSuccessStatusCode(route.method);
    const schema = this.resolveSchemaRef(route.response, namedSchemas);
    return {
      [statusCode]: {
        description: 'OK',
        content: { 'application/json': { schema } },
      },
    };
  }

  private getSuccessStatusCode(method: HttpMethod): string {
    if (method === 'POST') return '201';
    return '200';
  }

  convertPath(routePath: string): string {
    return routePath.replace(/:(\w+)/g, '{$1}');
  }

  buildParameters(route: RouteIR, middlewareMap: Map<string, MiddlewareIR>): OpenAPIParameter[] {
    const params: OpenAPIParameter[] = [];
    const headerMap = new Map<string, OpenAPIParameter>();

    // Middleware headers first (route-level overrides later)
    for (const mwRef of route.middleware) {
      const mw = middlewareMap.get(mwRef.name);
      if (!mw?.headers?.jsonSchema) continue;
      const schema = mw.headers.jsonSchema as JSONSchemaObject;
      const props = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      for (const [name, propSchema] of Object.entries(props)) {
        headerMap.set(name, {
          name,
          in: 'header',
          required: required.has(name),
          schema: propSchema,
        });
      }
    }

    // Path params
    if (route.params?.jsonSchema) {
      const schema = route.params.jsonSchema as JSONSchemaObject;
      const props = schema.properties ?? {};
      for (const [name, propSchema] of Object.entries(props)) {
        params.push({
          name,
          in: 'path',
          required: true, // path params are always required
          schema: propSchema,
        });
      }
    }

    // Query params
    if (route.query?.jsonSchema) {
      const schema = route.query.jsonSchema as JSONSchemaObject;
      const props = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      for (const [name, propSchema] of Object.entries(props)) {
        params.push({
          name,
          in: 'query',
          required: required.has(name),
          schema: propSchema,
        });
      }
    }

    // Route headers (overrides middleware headers)
    if (route.headers?.jsonSchema) {
      const schema = route.headers.jsonSchema as JSONSchemaObject;
      const props = schema.properties ?? {};
      const required = new Set(schema.required ?? []);
      for (const [name, propSchema] of Object.entries(props)) {
        headerMap.set(name, {
          name,
          in: 'header',
          required: required.has(name),
          schema: propSchema,
        });
      }
    }

    // Add all headers
    for (const header of headerMap.values()) {
      params.push(header);
    }

    return params;
  }

  resolveSchemaRef(schemaRef: SchemaRef, _namedSchemas: Map<string, SchemaIR>): JSONSchemaObject {
    if (schemaRef.kind === 'named') {
      return { $ref: `#/components/schemas/${schemaRef.schemaName}` };
    }
    return (schemaRef.jsonSchema as JSONSchemaObject) ?? {};
  }

  liftDefsToComponents(
    schema: JSONSchemaObject,
    components: Record<string, JSONSchemaObject>,
  ): JSONSchemaObject {
    const result = { ...schema };

    if (result.$defs) {
      for (const [name, defSchema] of Object.entries(result.$defs)) {
        // Recursively lift nested $defs
        const lifted = this.liftDefsToComponents(defSchema, components);
        // Handle name conflicts
        let targetName = name;
        if (components[name] && JSON.stringify(components[name]) !== JSON.stringify(lifted)) {
          let suffix = 2;
          while (components[`${name}_${suffix}`]) suffix++;
          targetName = `${name}_${suffix}`;
        }
        components[targetName] = lifted;
      }
      delete result.$defs;
    }

    // Rewrite $ref pointers
    return this.rewriteRefs(result);
  }

  private rewriteRefs(schema: JSONSchemaObject): JSONSchemaObject {
    const result = { ...schema };

    if (result.$ref?.startsWith('#/$defs/')) {
      result.$ref = result.$ref.replace('#/$defs/', '#/components/schemas/');
    }

    if (result.properties) {
      const newProps: Record<string, JSONSchemaObject> = {};
      for (const [key, value] of Object.entries(result.properties)) {
        newProps[key] = this.rewriteRefs(value);
      }
      result.properties = newProps;
    }

    if (result.items) {
      result.items = this.rewriteRefs(result.items);
    }

    for (const key of ['oneOf', 'allOf', 'anyOf'] as const) {
      if (result[key]) {
        result[key] = (result[key] as JSONSchemaObject[]).map((s) => this.rewriteRefs(s));
      }
    }

    if (result.additionalProperties && typeof result.additionalProperties === 'object') {
      result.additionalProperties = this.rewriteRefs(
        result.additionalProperties as JSONSchemaObject,
      );
    }

    return result;
  }

  collectTags(ir: AppIR): OpenAPITag[] {
    const tagNames = new Set<string>();
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          for (const tag of route.tags) {
            tagNames.add(tag);
          }
        }
      }
    }
    return [...tagNames].sort().map((name) => ({ name }));
  }
}
