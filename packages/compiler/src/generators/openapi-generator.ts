import { writeFile } from 'node:fs/promises';
import type { AppIR, HttpMethod, MiddlewareIR, RouteIR, SchemaRef } from '../ir/types';
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
    const { description } = this.config.compiler.openapi.info;

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
          const operation = this.buildOperation(route, middlewareMap, components);
          (paths[pathKey] as Record<string, OpenAPIOperation>)[method] = operation;
        }
      }
    }

    for (const schema of ir.schemas) {
      if (schema.isNamed && schema.id && schema.jsonSchema) {
        components[schema.id] = schema.jsonSchema as JSONSchemaObject;
      }
    }

    const info: OpenAPIInfo = {
      title: this.config.compiler.openapi.info.title,
      version,
    };
    if (description) {
      info.description = description;
    }

    return {
      openapi: '3.1.0',
      info,
      servers: [{ url: ir.app.basePath || '/' }],
      paths,
      components: { schemas: components },
      tags: this.collectTags(ir),
    };
  }

  private buildOperation(
    route: RouteIR,
    middlewareMap: Map<string, MiddlewareIR>,
    components: Record<string, JSONSchemaObject>,
  ): OpenAPIOperation {
    const operation: OpenAPIOperation = {
      operationId: route.operationId,
      tags: route.tags,
      parameters: this.buildParameters(route, middlewareMap),
      responses: this.buildResponses(route, components),
    };

    if (route.description) {
      operation.description = route.description;
    }

    if (route.body) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': { schema: this.resolveAndLift(route.body, components) },
        },
      };
    }

    return operation;
  }

  private buildResponses(
    route: RouteIR,
    components: Record<string, JSONSchemaObject>,
  ): Record<string, OpenAPIResponse> {
    if (!route.response) {
      if (route.method === 'DELETE') {
        return { '204': { description: 'No Content' } };
      }
      return { '200': { description: 'OK' } };
    }

    const statusCode = this.getSuccessStatusCode(route.method);
    return {
      [statusCode]: {
        description: 'OK',
        content: {
          'application/json': { schema: this.resolveAndLift(route.response, components) },
        },
      },
    };
  }

  private resolveAndLift(
    schemaRef: SchemaRef,
    components: Record<string, JSONSchemaObject>,
  ): JSONSchemaObject {
    const resolved = this.resolveSchemaRef(schemaRef);
    if (schemaRef.kind === 'inline' && resolved.$defs) {
      return this.liftDefsToComponents(resolved, components);
    }
    return resolved;
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
      if (mw?.headers?.jsonSchema) {
        this.extractHeaderParams(mw.headers.jsonSchema as JSONSchemaObject, headerMap);
      }
    }

    // Path params (always required)
    if (route.params?.jsonSchema) {
      const schema = route.params.jsonSchema as JSONSchemaObject;
      for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
        params.push({ name, in: 'path', required: true, schema: propSchema });
      }
    }

    // Query params
    if (route.query?.jsonSchema) {
      this.extractParamsFromSchema(route.query.jsonSchema as JSONSchemaObject, 'query', params);
    }

    // Route headers (overrides middleware headers)
    if (route.headers?.jsonSchema) {
      this.extractHeaderParams(route.headers.jsonSchema as JSONSchemaObject, headerMap);
    }

    params.push(...headerMap.values());
    return params;
  }

  resolveSchemaRef(schemaRef: SchemaRef): JSONSchemaObject {
    if (schemaRef.kind === 'named') {
      return { $ref: `#/components/schemas/${schemaRef.schemaName}` };
    }
    return (schemaRef.jsonSchema as JSONSchemaObject) ?? {};
  }

  private extractParamsFromSchema(
    schema: JSONSchemaObject,
    location: 'query' | 'header',
    target: OpenAPIParameter[],
  ): void {
    const required = new Set(schema.required ?? []);
    for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
      target.push({ name, in: location, required: required.has(name), schema: propSchema });
    }
  }

  private extractHeaderParams(
    schema: JSONSchemaObject,
    headerMap: Map<string, OpenAPIParameter>,
  ): void {
    const required = new Set(schema.required ?? []);
    for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
      headerMap.set(name, { name, in: 'header', required: required.has(name), schema: propSchema });
    }
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
