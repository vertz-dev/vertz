import { createDiagnostic, createDiagnosticFromLocation } from '../errors';

const METHODS_WITHOUT_RESPONSE = new Set(['DELETE', 'HEAD', 'OPTIONS']);
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
export class CompletenessValidator {
  async validate(ir) {
    const diagnostics = [];
    this.checkResponseSchemas(ir, diagnostics);
    this.checkUnusedServices(ir, diagnostics);
    this.checkUnreferencedSchemas(ir, diagnostics);
    this.checkDIWiring(ir, diagnostics);
    this.checkMiddlewareChains(ir, diagnostics);
    this.checkCtxKeyCollisions(ir, diagnostics);
    this.checkDuplicateRoutes(ir, diagnostics);
    this.checkPathParamMatch(ir, diagnostics);
    this.checkModuleOptions(ir, diagnostics);
    this.checkRoutePathFormat(ir, diagnostics);
    return diagnostics;
  }
  checkResponseSchemas(ir, diagnostics) {
    for (const route of allRoutes(ir)) {
      if (!route.response && !METHODS_WITHOUT_RESPONSE.has(route.method)) {
        diagnostics.push(
          createDiagnosticFromLocation(route, {
            severity: 'error',
            code: 'VERTZ_ROUTE_MISSING_RESPONSE',
            message: `Route ${route.method} ${route.fullPath} has no response schema.`,
            suggestion: "Add a 'response' property to the route config.",
          }),
        );
      }
    }
  }
  checkUnusedServices(ir, diagnostics) {
    const referenced = collectAllInjectedTokens(ir);
    for (const mod of ir.modules) {
      for (const exp of mod.exports) {
        referenced.add(exp);
      }
      for (const svc of mod.services) {
        if (!referenced.has(svc.name)) {
          diagnostics.push(
            createDiagnosticFromLocation(svc, {
              severity: 'warning',
              code: 'VERTZ_DEAD_CODE',
              message: `Service '${svc.name}' in module '${mod.name}' is never injected or exported.`,
            }),
          );
        }
      }
    }
  }
  checkUnreferencedSchemas(ir, diagnostics) {
    const referenced = new Set();
    function addRef(ref) {
      if (ref?.kind === 'named') referenced.add(ref.schemaName);
    }
    for (const mod of ir.modules) {
      addRef(mod.options);
      for (const route of allModuleRoutes(mod.routers)) {
        addRef(route.params);
        addRef(route.query);
        addRef(route.body);
        addRef(route.headers);
        addRef(route.response);
      }
    }
    for (const mw of ir.middleware) {
      addRef(mw.headers);
      addRef(mw.params);
      addRef(mw.query);
      addRef(mw.body);
      addRef(mw.requires);
      addRef(mw.provides);
    }
    for (const schema of ir.schemas) {
      if (!schema.isNamed) continue;
      if (referenced.has(schema.name)) continue;
      diagnostics.push(
        createDiagnosticFromLocation(schema, {
          severity: 'warning',
          code: 'VERTZ_DEAD_CODE',
          message: `Schema '${schema.name}' is not referenced by any route or middleware.`,
        }),
      );
    }
  }
  checkDIWiring(ir, diagnostics) {
    const moduleExports = new Map();
    for (const mod of ir.modules) {
      moduleExports.set(mod.name, new Set(mod.exports));
    }
    for (const mod of ir.modules) {
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
      for (const svc of mod.services) {
        this.checkInjectTokens(svc.name, 'Service', svc.inject, available, svc, diagnostics);
      }
      for (const router of mod.routers) {
        this.checkInjectTokens(
          router.name,
          'Router',
          router.inject,
          available,
          router,
          diagnostics,
        );
      }
    }
  }
  checkInjectTokens(ownerName, ownerKind, inject, available, location, diagnostics) {
    for (const inj of inject) {
      if (available.has(inj.resolvedToken)) continue;
      diagnostics.push(
        createDiagnosticFromLocation(location, {
          severity: 'error',
          code: 'VERTZ_SERVICE_INJECT_MISSING',
          message: `${ownerKind} '${ownerName}' injects '${inj.resolvedToken}' which cannot be resolved.`,
        }),
      );
    }
  }
  checkMiddlewareChains(ir, diagnostics) {
    const mwMap = new Map();
    for (const mw of ir.middleware) {
      mwMap.set(mw.name, mw);
    }
    const providedKeys = new Set();
    for (const mwRef of ir.app.globalMiddleware) {
      const mw = mwMap.get(mwRef.name);
      if (!mw) continue;
      for (const key of extractSchemaPropertyKeys(mw.requires)) {
        if (!providedKeys.has(key)) {
          diagnostics.push(
            createDiagnosticFromLocation(mw, {
              severity: 'error',
              code: 'VERTZ_MW_REQUIRES_UNSATISFIED',
              message: `Middleware '${mw.name}' requires '${key}' but no preceding middleware provides it.`,
            }),
          );
        }
      }
      for (const key of extractSchemaPropertyKeys(mw.provides)) {
        providedKeys.add(key);
      }
    }
  }
  checkModuleOptions(ir, diagnostics) {
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
  checkRoutePathFormat(ir, diagnostics) {
    for (const route of allRoutes(ir)) {
      if (!route.path.startsWith('/')) {
        diagnostics.push(
          createDiagnosticFromLocation(route, {
            severity: 'error',
            code: 'VERTZ_RT_INVALID_PATH',
            message: `Route path '${route.path}' must start with '/'.`,
            suggestion: `Change the path to '/${route.path}'.`,
          }),
        );
      }
    }
  }
  checkPathParamMatch(ir, diagnostics) {
    for (const route of allRoutes(ir)) {
      if (!route.params) continue;
      const pathParams = new Set(extractPathParams(route.fullPath));
      const schemaParams = new Set(extractSchemaPropertyKeys(route.params));
      for (const param of pathParams) {
        if (!schemaParams.has(param)) {
          diagnostics.push(
            createDiagnosticFromLocation(route, {
              severity: 'error',
              code: 'VERTZ_ROUTE_PARAM_MISMATCH',
              message: `Route ${route.method} ${route.fullPath} has path parameter ':${param}' not defined in params schema.`,
            }),
          );
        }
      }
      for (const param of schemaParams) {
        if (!pathParams.has(param)) {
          diagnostics.push(
            createDiagnosticFromLocation(route, {
              severity: 'warning',
              code: 'VERTZ_ROUTE_PARAM_MISMATCH',
              message: `Route ${route.method} ${route.fullPath} params schema defines '${param}' which is not a path parameter.`,
            }),
          );
        }
      }
    }
  }
  checkDuplicateRoutes(ir, diagnostics) {
    const seen = new Map();
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          const key = `${route.method} ${route.fullPath}`;
          const existing = seen.get(key);
          if (existing) {
            diagnostics.push(
              createDiagnosticFromLocation(route, {
                severity: 'error',
                code: 'VERTZ_ROUTE_DUPLICATE',
                message: `Duplicate route: ${key} defined in ${existing} and ${router.name}.`,
              }),
            );
          } else {
            seen.set(key, router.name);
          }
        }
      }
    }
  }
  checkCtxKeyCollisions(ir, diagnostics) {
    const keyProviders = new Map();
    for (const mw of ir.middleware) {
      const providedKeys = extractSchemaPropertyKeys(mw.provides);
      for (const key of providedKeys) {
        if (RESERVED_CTX_KEYS.has(key)) {
          diagnostics.push(
            createDiagnosticFromLocation(mw, {
              severity: 'error',
              code: 'VERTZ_CTX_COLLISION',
              message: `Context key '${key}' provided by middleware '${mw.name}' is a reserved ctx property.`,
            }),
          );
          continue;
        }
        const existing = keyProviders.get(key);
        if (existing) {
          diagnostics.push(
            createDiagnosticFromLocation(mw, {
              severity: 'error',
              code: 'VERTZ_CTX_COLLISION',
              message: `Context key '${key}' is provided by both '${existing}' and '${mw.name}'.`,
            }),
          );
        } else {
          keyProviders.set(key, mw.name);
        }
      }
    }
    const injectedNames = new Set();
    for (const mod of ir.modules) {
      for (const router of mod.routers) {
        for (const inj of router.inject) {
          injectedNames.add(inj.resolvedToken);
        }
      }
    }
    for (const mw of ir.middleware) {
      for (const key of extractSchemaPropertyKeys(mw.provides)) {
        if (injectedNames.has(key)) {
          diagnostics.push(
            createDiagnosticFromLocation(mw, {
              severity: 'error',
              code: 'VERTZ_CTX_COLLISION',
              message: `Context key '${key}' provided by middleware '${mw.name}' collides with injected service name.`,
            }),
          );
        }
      }
    }
  }
}
// ── Shared helpers ────────────────────────────────────────────────
function extractSchemaPropertyKeys(ref) {
  if (!ref) return [];
  const props = ref.jsonSchema?.properties;
  if (!props || typeof props !== 'object') return [];
  return Object.keys(props);
}
function extractPathParams(path) {
  return path
    .split('/')
    .filter((s) => s.startsWith(':'))
    .map((s) => s.slice(1));
}
function* allModuleRoutes(routers) {
  for (const router of routers) {
    yield* router.routes;
  }
}
function* allRoutes(ir) {
  for (const mod of ir.modules) {
    yield* allModuleRoutes(mod.routers);
  }
}
function collectAllInjectedTokens(ir) {
  const tokens = new Set();
  for (const mod of ir.modules) {
    for (const router of mod.routers) {
      for (const inj of router.inject) {
        tokens.add(inj.resolvedToken);
      }
    }
    for (const svc of mod.services) {
      for (const inj of svc.inject) {
        tokens.add(inj.resolvedToken);
      }
    }
  }
  for (const mw of ir.middleware) {
    for (const inj of mw.inject) {
      tokens.add(inj.resolvedToken);
    }
  }
  return tokens;
}
//# sourceMappingURL=completeness-validator.js.map
