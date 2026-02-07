import type { Validator } from '../compiler';
import type { Diagnostic } from '../errors';
import { createDiagnostic } from '../errors';
import type { AppIR, HttpMethod, MiddlewareIR, SchemaRef } from '../ir/types';

const METHODS_WITHOUT_RESPONSE: ReadonlySet<HttpMethod> = new Set(['DELETE', 'HEAD', 'OPTIONS']);

export class CompletenessValidator implements Validator {
  async validate(ir: AppIR): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    this.checkResponseSchemas(ir, diagnostics);
    this.checkUnusedServices(ir, diagnostics);
    this.checkUnreferencedSchemas(ir, diagnostics);
    this.checkDIWiring(ir, diagnostics);
    this.checkMiddlewareChains(ir, diagnostics);
    this.checkCtxKeyCollisions(ir, diagnostics);
    this.checkDuplicateRoutes(ir, diagnostics);
    this.checkPathParamMatch(ir, diagnostics);
    this.checkModuleOptions(ir, diagnostics);

    return diagnostics;
  }

  private checkResponseSchemas(ir: AppIR, diagnostics: Diagnostic[]): void {
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          if (!route.response && !METHODS_WITHOUT_RESPONSE.has(route.method)) {
            diagnostics.push(
              createDiagnostic({
                severity: 'error',
                code: 'VERTZ_ROUTE_MISSING_RESPONSE',
                message: `Route ${route.method} ${route.fullPath} has no response schema.`,
                file: route.sourceFile,
                line: route.sourceLine,
                column: route.sourceColumn,
                suggestion: "Add a 'response' property to the route config.",
              }),
            );
          }
        }
      }
    }
  }

  private checkUnusedServices(ir: AppIR, diagnostics: Diagnostic[]): void {
    // Collect all referenced service tokens
    const referenced = new Set<string>();
    for (const mod of ir.modules) {
      // Exported services are considered referenced
      for (const exp of mod.exports) {
        referenced.add(exp);
      }
      // Injected services in routers and other services
      for (const router of mod.routers) {
        for (const inj of router.inject) {
          referenced.add(inj.resolvedToken);
        }
      }
      for (const svc of mod.services) {
        for (const inj of svc.inject) {
          referenced.add(inj.resolvedToken);
        }
      }
    }
    // Middleware inject
    for (const mw of ir.middleware) {
      for (const inj of mw.inject) {
        referenced.add(inj.resolvedToken);
      }
    }

    // Check each service
    for (const mod of ir.modules) {
      for (const svc of mod.services) {
        if (!referenced.has(svc.name)) {
          diagnostics.push(
            createDiagnostic({
              severity: 'warning',
              code: 'VERTZ_DEAD_CODE',
              message: `Service '${svc.name}' in module '${mod.name}' is never injected or exported.`,
              file: svc.sourceFile,
              line: svc.sourceLine,
              column: svc.sourceColumn,
            }),
          );
        }
      }
    }
  }

  private checkUnreferencedSchemas(ir: AppIR, diagnostics: Diagnostic[]): void {
    // Collect all referenced schema names
    const referenced = new Set<string>();

    const addSchemaRef = (ref: SchemaRef | undefined) => {
      if (ref?.kind === 'named') referenced.add(ref.schemaName);
    };

    for (const mod of ir.modules) {
      if (mod.options) addSchemaRef(mod.options);
      for (const router of mod.routers) {
        for (const route of router.routes) {
          addSchemaRef(route.params);
          addSchemaRef(route.query);
          addSchemaRef(route.body);
          addSchemaRef(route.headers);
          addSchemaRef(route.response);
        }
      }
    }
    for (const mw of ir.middleware) {
      addSchemaRef(mw.headers);
      addSchemaRef(mw.params);
      addSchemaRef(mw.query);
      addSchemaRef(mw.body);
      addSchemaRef(mw.requires);
      addSchemaRef(mw.provides);
    }

    for (const schema of ir.schemas) {
      if (!schema.isNamed) continue;
      if (!referenced.has(schema.name)) {
        diagnostics.push(
          createDiagnostic({
            severity: 'warning',
            code: 'VERTZ_DEAD_CODE',
            message: `Schema '${schema.name}' is not referenced by any route or middleware.`,
            file: schema.sourceFile,
            line: schema.sourceLine,
            column: schema.sourceColumn,
          }),
        );
      }
    }
  }

  private checkDIWiring(ir: AppIR, diagnostics: Diagnostic[]): void {
    // Build a map of module name -> set of available service tokens
    const moduleExports = new Map<string, Set<string>>();
    const moduleServices = new Map<string, Set<string>>();
    for (const mod of ir.modules) {
      moduleExports.set(mod.name, new Set(mod.exports));
      moduleServices.set(mod.name, new Set(mod.services.map((s) => s.name)));
    }

    for (const mod of ir.modules) {
      // Available tokens: local services + exported services from imported modules
      const available = new Set(mod.services.map((s) => s.name));
      for (const imp of mod.imports) {
        if (imp.isEnvImport || !imp.sourceModule) continue;
        const exports = moduleExports.get(imp.sourceModule);
        if (exports) {
          for (const exp of exports) {
            available.add(exp);
          }
        }
      }

      // Check service inject refs
      for (const svc of mod.services) {
        for (const inj of svc.inject) {
          if (!available.has(inj.resolvedToken)) {
            diagnostics.push(
              createDiagnostic({
                severity: 'error',
                code: 'VERTZ_SERVICE_INJECT_MISSING',
                message: `Service '${svc.name}' injects '${inj.resolvedToken}' which cannot be resolved.`,
                file: svc.sourceFile,
                line: svc.sourceLine,
                column: svc.sourceColumn,
              }),
            );
          }
        }
      }

      // Check router inject refs
      for (const router of mod.routers) {
        for (const inj of router.inject) {
          if (!available.has(inj.resolvedToken)) {
            diagnostics.push(
              createDiagnostic({
                severity: 'error',
                code: 'VERTZ_SERVICE_INJECT_MISSING',
                message: `Router '${router.name}' injects '${inj.resolvedToken}' which cannot be resolved.`,
                file: router.sourceFile,
                line: router.sourceLine,
                column: router.sourceColumn,
              }),
            );
          }
        }
      }
    }
  }

  private checkMiddlewareChains(ir: AppIR, diagnostics: Diagnostic[]): void {
    // Build a map of middleware name -> MiddlewareIR
    const mwMap = new Map<string, MiddlewareIR>();
    for (const mw of ir.middleware) {
      mwMap.set(mw.name, mw);
    }

    // Walk global middleware in order, tracking provided keys
    const providedKeys = new Set<string>();
    for (const mwRef of ir.app.globalMiddleware) {
      const mw = mwMap.get(mwRef.name);
      if (!mw) continue;

      // Check requires
      const requiredKeys = this.extractSchemaPropertyKeys(mw.requires);
      for (const key of requiredKeys) {
        if (!providedKeys.has(key)) {
          diagnostics.push(
            createDiagnostic({
              severity: 'error',
              code: 'VERTZ_MW_REQUIRES_UNSATISFIED',
              message: `Middleware '${mw.name}' requires '${key}' but no preceding middleware provides it.`,
              file: mw.sourceFile,
              line: mw.sourceLine,
              column: mw.sourceColumn,
            }),
          );
        }
      }

      // Add provides
      const providesKeys = this.extractSchemaPropertyKeys(mw.provides);
      for (const key of providesKeys) {
        providedKeys.add(key);
      }
    }
  }

  private checkModuleOptions(ir: AppIR, diagnostics: Diagnostic[]): void {
    const moduleMap = new Map(ir.modules.map((m) => [m.name, m]));

    for (const reg of ir.app.moduleRegistrations) {
      const mod = moduleMap.get(reg.moduleName);
      if (!mod) continue;

      if (reg.options && !mod.options) {
        diagnostics.push(
          createDiagnostic({
            severity: 'warning',
            code: 'VERTZ_MODULE_OPTIONS_INVALID',
            message: `Module '${reg.moduleName}' received options but does not define an options schema.`,
          }),
        );
      }

      if (!reg.options && mod.options) {
        diagnostics.push(
          createDiagnostic({
            severity: 'error',
            code: 'VERTZ_MODULE_OPTIONS_INVALID',
            message: `Module '${reg.moduleName}' requires options but none were provided in .register().`,
          }),
        );
      }
    }
  }

  private checkPathParamMatch(ir: AppIR, diagnostics: Diagnostic[]): void {
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          if (!route.params) continue;
          const pathParams = this.extractPathParams(route.fullPath);
          const schemaParams = new Set(this.extractSchemaPropertyKeys(route.params));

          // Check path params not in schema
          for (const param of pathParams) {
            if (!schemaParams.has(param)) {
              diagnostics.push(
                createDiagnostic({
                  severity: 'error',
                  code: 'VERTZ_ROUTE_PARAM_MISMATCH',
                  message: `Route ${route.method} ${route.fullPath} has path parameter ':${param}' not defined in params schema.`,
                  file: route.sourceFile,
                  line: route.sourceLine,
                  column: route.sourceColumn,
                }),
              );
            }
          }

          // Check schema params not in path
          const pathParamSet = new Set(pathParams);
          for (const param of schemaParams) {
            if (!pathParamSet.has(param)) {
              diagnostics.push(
                createDiagnostic({
                  severity: 'warning',
                  code: 'VERTZ_ROUTE_PARAM_MISMATCH',
                  message: `Route ${route.method} ${route.fullPath} params schema defines '${param}' which is not a path parameter.`,
                  file: route.sourceFile,
                  line: route.sourceLine,
                  column: route.sourceColumn,
                }),
              );
            }
          }
        }
      }
    }
  }

  private extractPathParams(path: string): string[] {
    const params: string[] = [];
    for (const segment of path.split('/')) {
      if (segment.startsWith(':')) {
        params.push(segment.slice(1));
      }
    }
    return params;
  }

  private checkDuplicateRoutes(ir: AppIR, diagnostics: Diagnostic[]): void {
    const seen = new Map<string, string>(); // "METHOD /path" -> routerName
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          const key = `${route.method} ${route.fullPath}`;
          const existing = seen.get(key);
          if (existing) {
            diagnostics.push(
              createDiagnostic({
                severity: 'error',
                code: 'VERTZ_ROUTE_DUPLICATE',
                message: `Duplicate route: ${key} defined in ${existing} and ${router.name}.`,
                file: route.sourceFile,
                line: route.sourceLine,
                column: route.sourceColumn,
              }),
            );
          } else {
            seen.set(key, router.name);
          }
        }
      }
    }
  }

  private checkCtxKeyCollisions(ir: AppIR, diagnostics: Diagnostic[]): void {
    const RESERVED_CTX_KEYS = new Set([
      'params',
      'body',
      'query',
      'headers',
      'raw',
      'state',
      'options',
      'env',
    ]);

    // Track key -> first provider middleware name
    const keyProviders = new Map<string, string>();

    // Check reserved collisions and duplicate provider collisions
    for (const mw of ir.middleware) {
      const providedKeys = this.extractSchemaPropertyKeys(mw.provides);
      for (const key of providedKeys) {
        if (RESERVED_CTX_KEYS.has(key)) {
          diagnostics.push(
            createDiagnostic({
              severity: 'error',
              code: 'VERTZ_CTX_COLLISION',
              message: `Context key '${key}' provided by middleware '${mw.name}' is a reserved ctx property.`,
              file: mw.sourceFile,
              line: mw.sourceLine,
              column: mw.sourceColumn,
            }),
          );
          continue;
        }

        const existing = keyProviders.get(key);
        if (existing) {
          diagnostics.push(
            createDiagnostic({
              severity: 'error',
              code: 'VERTZ_CTX_COLLISION',
              message: `Context key '${key}' is provided by both '${existing}' and '${mw.name}'.`,
              file: mw.sourceFile,
              line: mw.sourceLine,
              column: mw.sourceColumn,
            }),
          );
        } else {
          keyProviders.set(key, mw.name);
        }
      }
    }

    // Check middleware provides vs injected service names
    const injectedNames = new Set<string>();
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const inj of router.inject) {
          injectedNames.add(inj.resolvedToken);
        }
      }
    }

    for (const mw of ir.middleware) {
      const providedKeys = this.extractSchemaPropertyKeys(mw.provides);
      for (const key of providedKeys) {
        if (injectedNames.has(key)) {
          diagnostics.push(
            createDiagnostic({
              severity: 'error',
              code: 'VERTZ_CTX_COLLISION',
              message: `Context key '${key}' provided by middleware '${mw.name}' collides with injected service name.`,
              file: mw.sourceFile,
              line: mw.sourceLine,
              column: mw.sourceColumn,
            }),
          );
        }
      }
    }
  }

  private extractSchemaPropertyKeys(ref: SchemaRef | undefined): string[] {
    if (!ref) return [];
    const schema = ref.jsonSchema;
    if (!schema || typeof schema !== 'object') return [];
    const props = schema.properties;
    if (!props || typeof props !== 'object') return [];
    return Object.keys(props);
  }
}
