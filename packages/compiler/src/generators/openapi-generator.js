import { writeFile } from 'node:fs/promises';
import { BaseGenerator } from './base-generator';
export class OpenAPIGenerator extends BaseGenerator {
  name = 'openapi';
  async generate(ir, outputDir) {
    const doc = this.buildDocument(ir);
    const outputPath = this.resolveOutputPath(outputDir, 'openapi.json');
    await writeFile(outputPath, JSON.stringify(doc, null, 2));
  }
  buildDocument(ir) {
    const version = ir.app.version ?? this.config.compiler.openapi.info.version;
    const { description } = this.config.compiler.openapi.info;
    const middlewareMap = new Map();
    for (const mw of ir.middleware) {
      middlewareMap.set(mw.name, mw);
    }
    const paths = {};
    const components = {};
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          const pathKey = this.convertPath(route.fullPath);
          if (!paths[pathKey]) paths[pathKey] = {};
          const method = route.method.toLowerCase();
          const operation = this.buildOperation(route, middlewareMap, components);
          paths[pathKey][method] = operation;
        }
      }
    }
    for (const schema of ir.schemas) {
      if (schema.isNamed && schema.id && schema.jsonSchema) {
        components[schema.id] = schema.jsonSchema;
      }
    }
    const info = {
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
  buildOperation(route, middlewareMap, components) {
    const operation = {
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
  buildResponses(route, components) {
    if (!route.response) {
      if (route.method === 'DELETE') {
        return { 204: { description: 'No Content' } };
      }
      return { 200: { description: 'OK' } };
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
  resolveAndLift(schemaRef, components) {
    const resolved = this.resolveSchemaRef(schemaRef);
    if (schemaRef.kind === 'inline' && resolved.$defs) {
      return this.liftDefsToComponents(resolved, components);
    }
    return resolved;
  }
  getSuccessStatusCode(method) {
    if (method === 'POST') return '201';
    return '200';
  }
  convertPath(routePath) {
    return routePath.replace(/:(\w+)/g, '{$1}');
  }
  buildParameters(route, middlewareMap) {
    const params = [];
    const headerMap = new Map();
    // Middleware headers first (route-level overrides later)
    for (const mwRef of route.middleware) {
      const mw = middlewareMap.get(mwRef.name);
      if (mw?.headers?.jsonSchema) {
        this.extractHeaderParams(mw.headers.jsonSchema, headerMap);
      }
    }
    // Path params (always required)
    if (route.params?.jsonSchema) {
      const schema = route.params.jsonSchema;
      for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
        params.push({ name, in: 'path', required: true, schema: propSchema });
      }
    }
    // Query params
    if (route.query?.jsonSchema) {
      this.extractParamsFromSchema(route.query.jsonSchema, 'query', params);
    }
    // Route headers (overrides middleware headers)
    if (route.headers?.jsonSchema) {
      this.extractHeaderParams(route.headers.jsonSchema, headerMap);
    }
    params.push(...headerMap.values());
    return params;
  }
  resolveSchemaRef(schemaRef) {
    if (schemaRef.kind === 'named') {
      return { $ref: `#/components/schemas/${schemaRef.schemaName}` };
    }
    return schemaRef.jsonSchema ?? {};
  }
  extractParamsFromSchema(schema, location, target) {
    const required = new Set(schema.required ?? []);
    for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
      target.push({ name, in: location, required: required.has(name), schema: propSchema });
    }
  }
  extractHeaderParams(schema, headerMap) {
    const required = new Set(schema.required ?? []);
    for (const [name, propSchema] of Object.entries(schema.properties ?? {})) {
      headerMap.set(name, { name, in: 'header', required: required.has(name), schema: propSchema });
    }
  }
  liftDefsToComponents(schema, components) {
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
  rewriteRefs(schema) {
    const result = { ...schema };
    if (result.$ref?.startsWith('#/$defs/')) {
      result.$ref = result.$ref.replace('#/$defs/', '#/components/schemas/');
    }
    if (result.properties) {
      const newProps = {};
      for (const [key, value] of Object.entries(result.properties)) {
        newProps[key] = this.rewriteRefs(value);
      }
      result.properties = newProps;
    }
    if (result.items) {
      result.items = this.rewriteRefs(result.items);
    }
    for (const key of ['oneOf', 'allOf', 'anyOf']) {
      if (result[key]) {
        result[key] = result[key].map((s) => this.rewriteRefs(s));
      }
    }
    if (result.additionalProperties && typeof result.additionalProperties === 'object') {
      result.additionalProperties = this.rewriteRefs(result.additionalProperties);
    }
    return result;
  }
  collectTags(ir) {
    const tagNames = new Set();
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
//# sourceMappingURL=openapi-generator.js.map
