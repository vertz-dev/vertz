# Entity Analyzer — Implementation Spec

**Author:** Mika (VP Engineering)
**Date:** 2026-02-20
**Design doc:** `plans/entity-analyzer-design.md` (v2)
**Reviews:** Compiler Expert (Approve w/ Changes), DX Skeptic (Request Changes → addressed), Devil's Advocate (Request Changes → addressed), Tech Lead (Approve w/ Changes → addressed)
**Decision:** [Entity-First Architecture](decisions/2026-02-20-entity-first-architecture.md)

---

## Overview

Implement an `EntityAnalyzer` in the compiler that detects `entity(name, config)` calls from `@vertz/server`, extracts entity metadata into `EntityIR`, resolves model schemas for typed SDK generation, and generates routes for codegen/OpenAPI. Extend the codegen pipeline with entity-aware SDK generation.

## Scope

### In scope
- `EntityAnalyzer` class (detection, extraction, schema resolution)
- `EntityIR` types added to `AppIR`
- Route injection from entities (for OpenAPI/route-table generators)
- `ir-adapter.ts` entity handling + `CodegenEntityModule` types
- Entity SDK generator (typed client methods)
- Compiler wiring
- Debug output (`VERTZ_DEBUG=entities`)
- Full test suite (TDD)

### Out of scope
- `domain()` grouping (v0.2)
- Relation target entity resolution (v0.2)
- Barrel file re-export detection (known limitation, diagnostic emitted)

---

## Part 1: IR Types

### File: `packages/compiler/src/ir/types.ts`

Add after the Schema section:

```typescript
// ── Entity ─────────────────────────────────────────────────────────

export interface EntityIR extends SourceLocation {
  name: string;
  modelRef: EntityModelRef;
  access: EntityAccessIR;
  hooks: EntityHooksIR;
  actions: EntityActionIR[];
  relations: EntityRelationIR[];
}

export interface EntityModelRef {
  variableName: string;
  importSource?: string;
  tableName?: string;
  schemaRefs: EntityModelSchemaRefs;
}

export interface EntityModelSchemaRefs {
  response?: SchemaRef;
  createInput?: SchemaRef;
  updateInput?: SchemaRef;
  resolved: boolean;
}

export interface EntityAccessIR {
  list: EntityAccessRuleKind;
  get: EntityAccessRuleKind;
  create: EntityAccessRuleKind;
  update: EntityAccessRuleKind;
  delete: EntityAccessRuleKind;
  custom: Record<string, EntityAccessRuleKind>;
}

export type EntityAccessRuleKind = 'none' | 'false' | 'function';

export interface EntityHooksIR {
  before: ('create' | 'update')[];
  after: ('create' | 'update' | 'delete')[];
}

export interface EntityActionIR extends SourceLocation {
  name: string;
  inputSchemaRef: SchemaRef;
  outputSchemaRef: SchemaRef;
}

export interface EntityRelationIR {
  name: string;
  selection: 'all' | string[];
}
```

Add `entities` to `AppIR`:
```typescript
export interface AppIR {
  // ... existing fields ...
  entities: EntityIR[];  // ← ADD
}
```

### File: `packages/compiler/src/ir/builder.ts`

Update `createEmptyAppIR()`:
```typescript
export function createEmptyAppIR(): AppIR {
  return {
    // ... existing fields ...
    entities: [],  // ← ADD
  };
}
```

---

## Part 2: EntityAnalyzer

### File: `packages/compiler/src/analyzers/entity-analyzer.ts`

```typescript
import type { CallExpression, ObjectLiteralExpression, SourceFile, Expression, Type } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { EntityIR, EntityAccessIR, EntityAccessRuleKind, EntityHooksIR,
  EntityActionIR, EntityRelationIR, EntityModelRef, EntityModelSchemaRefs,
  SchemaRef, SourceLocation } from '../ir/types';
import { getSourceLocation, getStringValue, getBooleanValue,
  extractObjectLiteral, getPropertyValue, getProperties } from '../utils/ast-helpers';
import { isFromImport, findImportForIdentifier } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';

const ENTITY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const CRUD_OPS = ['list', 'get', 'create', 'update', 'delete'] as const;
type CrudOp = (typeof CRUD_OPS)[number];

export interface EntityAnalyzerResult {
  entities: EntityIR[];
}
```

### Detection methods

**`isEntityFile(file)`** — Check if file imports from `@vertz/server`:
```typescript
private isEntityFile(file: SourceFile): boolean {
  return file.getImportDeclarations().some(
    decl => decl.getModuleSpecifierValue() === '@vertz/server'
  );
}
```

**`findEntityCalls(file)`** — Find `entity(...)` calls using `isFromImport()`:
```typescript
private findEntityCalls(file: SourceFile): CallExpression[] {
  return file.getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const expr = call.getExpression();

      // Direct: entity(...) or aliased: myEntity(...)
      if (expr.isKind(SyntaxKind.Identifier)) {
        return isFromImport(expr, '@vertz/server');
      }

      // Namespace: server.entity(...)
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const propName = expr.getName();
        if (propName !== 'entity') return false;
        const obj = expr.getExpression();
        if (!obj.isKind(SyntaxKind.Identifier)) return false;
        // Check if the namespace import is from @vertz/server
        const sourceFile = obj.getSourceFile();
        const importDecl = sourceFile.getImportDeclarations().find(d =>
          d.getModuleSpecifierValue() === '@vertz/server'
          && d.getNamespaceImport()?.getText() === obj.getText()
        );
        return importDecl !== undefined;
      }

      return false;
    });
}
```

Note: `isFromImport(identifier, moduleSpecifier)` resolves the identifier's import declaration and checks if `getModuleSpecifierValue() === moduleSpecifier`. It handles aliased imports (`import { entity as e }`) because it traces the identifier to its import declaration, not by name matching.

For calls that look like `entity()` but don't resolve to `@vertz/server`, emit `ENTITY_UNRESOLVED_IMPORT` diagnostic.

### Extraction methods

**`extractEntity(file, call)`** — Extract full entity metadata:

```typescript
private extractEntity(file: SourceFile, call: CallExpression): EntityIR | null {
  const args = call.getArguments();
  const loc = getSourceLocation(call);

  // 1. Extract name (first arg, must be string literal)
  if (args.length < 2) {
    this.addDiagnostic({ code: 'ENTITY_MISSING_ARGS', severity: 'error',
      message: 'entity() requires two arguments: name and config', ...loc });
    return null;
  }
  const name = getStringValue(args[0] as Expression);
  if (name === null) {
    this.addDiagnostic({ code: 'ENTITY_NON_LITERAL_NAME', severity: 'error',
      message: 'entity() name must be a string literal', ...loc });
    return null;
  }
  if (!ENTITY_NAME_PATTERN.test(name)) {
    this.addDiagnostic({ code: 'ENTITY_INVALID_NAME', severity: 'error',
      message: `Entity name must match /^[a-z][a-z0-9-]*$/. Got: "${name}"`, ...loc });
    return null;
  }

  // 2. Extract config (second arg, must be object literal)
  const configObj = extractObjectLiteral(call, 1);
  if (!configObj) {
    this.addDiagnostic({ code: 'ENTITY_CONFIG_NOT_OBJECT', severity: 'warning',
      message: 'entity() config must be an object literal for static analysis', ...loc });
    return null;
  }

  // 3. Extract model reference
  const modelRef = this.extractModelRef(configObj, loc);
  if (!modelRef) return null;  // diagnostic already emitted

  // 4. Extract access, hooks, actions, relations
  const access = this.extractAccess(configObj);
  const hooks = this.extractHooks(configObj);
  const actions = this.extractActions(configObj);
  const relations = this.extractRelations(configObj);

  // 5. Validate action names don't collide with CRUD ops
  for (const action of actions) {
    if ((CRUD_OPS as readonly string[]).includes(action.name)) {
      this.addDiagnostic({ code: 'ENTITY_ACTION_NAME_COLLISION', severity: 'error',
        message: `Custom action "${action.name}" collides with built-in CRUD operation`,
        ...action });
    }
  }

  return { name, modelRef, access, hooks, actions, relations, ...loc };
}
```

**`extractModelRef(configObj, loc)`**:
```typescript
private extractModelRef(
  configObj: ObjectLiteralExpression, loc: SourceLocation
): EntityModelRef | null {
  const modelExpr = getPropertyValue(configObj, 'model');
  if (!modelExpr) {
    this.addDiagnostic({ code: 'ENTITY_MISSING_MODEL', severity: 'error',
      message: 'entity() requires a model property', ...loc });
    return null;
  }

  const variableName = modelExpr.isKind(SyntaxKind.Identifier)
    ? modelExpr.getText() : modelExpr.getText();

  // Try to resolve import source
  let importSource: string | undefined;
  if (modelExpr.isKind(SyntaxKind.Identifier)) {
    const importInfo = findImportForIdentifier(modelExpr);
    if (importInfo) {
      importSource = importInfo.importDecl.getModuleSpecifierValue();
    }
  }

  // Resolve model schemas via ts-morph type system
  const schemaRefs = this.resolveModelSchemas(modelExpr);

  return { variableName, importSource, schemaRefs };
}
```

**`resolveModelSchemas(modelExpr)`** — ts-morph type resolution:
```typescript
private resolveModelSchemas(modelExpr: Expression): EntityModelSchemaRefs {
  try {
    const modelType = modelExpr.getType();

    // Navigate: ModelDef.table -> TableDef (has column type info)
    const tableProp = modelType.getProperty('table');
    if (!tableProp) return { resolved: false };

    // Navigate: ModelDef.schemas -> { response, createInput, updateInput }
    const schemasProp = modelType.getProperty('schemas');
    if (!schemasProp) return { resolved: false };

    const schemasType = schemasProp.getTypeAtLocation(modelExpr);

    // Extract each schema type
    const response = this.extractSchemaType(schemasType, 'response', modelExpr);
    const createInput = this.extractSchemaType(schemasType, 'createInput', modelExpr);
    const updateInput = this.extractSchemaType(schemasType, 'updateInput', modelExpr);

    return {
      response,
      createInput,
      updateInput,
      resolved: response !== undefined || createInput !== undefined || updateInput !== undefined,
    };
  } catch {
    return { resolved: false };
  }
}

private extractSchemaType(
  parentType: Type, propertyName: string, location: Expression
): SchemaRef | undefined {
  const prop = parentType.getProperty(propertyName);
  if (!prop) return undefined;

  const propType = prop.getTypeAtLocation(location);
  const typeText = propType.getText();

  // Return as inline schema ref with the type text for codegen
  return {
    kind: 'inline' as const,
    sourceFile: location.getSourceFile().getFilePath(),
    jsonSchema: { __typeText: typeText },
  };
}
```

**Note on schema resolution approach:** `ModelDef` has a `schemas` property containing `{ response, createInput, updateInput }`. We navigate the type system to get TypeScript type text, which codegen can use to emit typed SDK methods. When the model is a simple variable with explicit types, ts-morph resolves this cleanly. For dynamic expressions (factory calls without return type annotations, ternaries), resolution fails gracefully and we fall back to `{ resolved: false }`.

**`extractAccess(configObj)`**:
```typescript
private extractAccess(configObj: ObjectLiteralExpression): EntityAccessIR {
  const defaults: EntityAccessIR = {
    list: 'none', get: 'none', create: 'none',
    update: 'none', delete: 'none', custom: {},
  };

  const accessExpr = getPropertyValue(configObj, 'access');
  if (!accessExpr || !accessExpr.isKind(SyntaxKind.ObjectLiteralExpression)) return defaults;

  const result = { ...defaults };
  for (const { name, value } of getProperties(accessExpr)) {
    const kind = this.classifyAccessRule(value);
    if ((CRUD_OPS as readonly string[]).includes(name)) {
      result[name as CrudOp] = kind;
    } else {
      result.custom[name] = kind;
    }
  }
  return result;
}

private classifyAccessRule(expr: Expression): EntityAccessRuleKind {
  // `false` literal → 'false'
  const boolVal = getBooleanValue(expr);
  if (boolVal === false) return 'false';
  // `true` literal or omitted → 'none' (no restriction)
  if (boolVal === true) return 'none';
  // Arrow function, function expression, or identifier → 'function'
  return 'function';
}
```

**`extractHooks(configObj)`**:
```typescript
private extractHooks(configObj: ObjectLiteralExpression): EntityHooksIR {
  const hooks: EntityHooksIR = { before: [], after: [] };

  const beforeExpr = getPropertyValue(configObj, 'before');
  if (beforeExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const { name } of getProperties(beforeExpr)) {
      if (name === 'create' || name === 'update') hooks.before.push(name);
    }
  }

  const afterExpr = getPropertyValue(configObj, 'after');
  if (afterExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    for (const { name } of getProperties(afterExpr)) {
      if (name === 'create' || name === 'update' || name === 'delete') hooks.after.push(name);
    }
  }

  return hooks;
}
```

**`extractActions(configObj)`**:
```typescript
private extractActions(configObj: ObjectLiteralExpression): EntityActionIR[] {
  const actionsExpr = getPropertyValue(configObj, 'actions');
  if (!actionsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

  return getProperties(actionsExpr).map(({ name, value }) => {
    const actionObj = value.isKind(SyntaxKind.ObjectLiteralExpression) ? value : null;
    const loc = getSourceLocation(value);

    const inputExpr = actionObj ? getPropertyValue(actionObj, 'input') : null;
    const outputExpr = actionObj ? getPropertyValue(actionObj, 'output') : null;

    if (!inputExpr || !outputExpr) {
      this.addDiagnostic({ code: 'ENTITY_ACTION_MISSING_SCHEMA', severity: 'warning',
        message: `Custom action "${name}" is missing input or output schema`, ...loc });
    }

    return {
      name,
      inputSchemaRef: inputExpr
        ? { kind: 'inline' as const, sourceFile: loc.sourceFile }
        : { kind: 'inline' as const, sourceFile: loc.sourceFile },
      outputSchemaRef: outputExpr
        ? { kind: 'inline' as const, sourceFile: loc.sourceFile }
        : { kind: 'inline' as const, sourceFile: loc.sourceFile },
      ...loc,
    };
  });
}
```

**`extractRelations(configObj)`**:
```typescript
private extractRelations(configObj: ObjectLiteralExpression): EntityRelationIR[] {
  const relExpr = getPropertyValue(configObj, 'relations');
  if (!relExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

  return getProperties(relExpr)
    .filter(({ value }) => {
      const boolVal = getBooleanValue(value);
      return boolVal !== false;  // false means excluded
    })
    .map(({ name, value }) => {
      const boolVal = getBooleanValue(value);
      if (boolVal === true) return { name, selection: 'all' as const };

      // Object literal with field keys
      if (value.isKind(SyntaxKind.ObjectLiteralExpression)) {
        const fields = getProperties(value).map(p => p.name);
        return { name, selection: fields };
      }

      return { name, selection: 'all' as const };
    });
}
```

---

## Part 3: Route Injection

### File: `packages/compiler/src/ir/entity-route-injector.ts`

Generates `RouteIR` entries from `EntityIR[]` and injects them into a synthetic `__entities` module. This exists so OpenAPI and route-table generators (which consume `ModuleIR → RouteIR`) work without modification.

```typescript
import type { AppIR, EntityIR, ModuleIR, RouterIR, RouteIR, HttpMethod } from './types';

const SYNTHETIC_MODULE = '__entities';

export function injectEntityRoutes(ir: AppIR): void {
  if (!ir.entities.length) return;

  const routes: RouteIR[] = [];
  for (const entity of ir.entities) {
    routes.push(...generateCrudRoutes(entity));
    routes.push(...generateActionRoutes(entity));
  }

  if (!routes.length) return;

  // Create synthetic module with single router
  const router: RouterIR = {
    name: `${SYNTHETIC_MODULE}_router`,
    moduleName: SYNTHETIC_MODULE,
    prefix: '',
    inject: [],
    routes,
    sourceFile: '', sourceLine: 0, sourceColumn: 0,
  };

  const module: ModuleIR = {
    name: SYNTHETIC_MODULE,
    imports: [],
    services: [],
    routers: [router],
    exports: [],
    sourceFile: '', sourceLine: 0, sourceColumn: 0,
  };

  ir.modules.push(module);
}
```

**`generateCrudRoutes(entity)`**:
```typescript
function generateCrudRoutes(entity: EntityIR): RouteIR[] {
  const entityPascal = toPascalCase(entity.name);
  const basePath = `/${entity.name}`;
  const routes: RouteIR[] = [];

  const ops: { op: string; method: HttpMethod; path: string; idParam: boolean }[] = [
    { op: 'list', method: 'GET', path: basePath, idParam: false },
    { op: 'get', method: 'GET', path: `${basePath}/:id`, idParam: true },
    { op: 'create', method: 'POST', path: basePath, idParam: false },
    { op: 'update', method: 'PATCH', path: `${basePath}/:id`, idParam: true },
    { op: 'delete', method: 'DELETE', path: `${basePath}/:id`, idParam: true },
  ];

  for (const { op, method, path, idParam } of ops) {
    const accessKind = entity.access[op as keyof typeof entity.access];
    if (accessKind === 'false') continue;

    routes.push({
      method,
      path,
      fullPath: path,
      operationId: `${op}${entityPascal}`,
      middleware: [],
      tags: [entity.name],
      description: `${op} ${entity.name}`,
      // Schema refs from model
      body: op === 'create' ? entity.modelRef.schemaRefs.createInput
        : op === 'update' ? entity.modelRef.schemaRefs.updateInput
        : undefined,
      response: entity.modelRef.schemaRefs.response,
      ...entity,  // source location
    });
  }

  return routes;
}
```

**`generateActionRoutes(entity)`**:
```typescript
function generateActionRoutes(entity: EntityIR): RouteIR[] {
  const entityPascal = toPascalCase(entity.name);

  return entity.actions
    .filter(action => entity.access.custom[action.name] !== 'false')
    .map(action => ({
      method: 'POST' as HttpMethod,
      path: `/${entity.name}/:id/${action.name}`,
      fullPath: `/${entity.name}/:id/${action.name}`,
      operationId: `${action.name}${entityPascal}`,
      body: action.inputSchemaRef,
      response: action.outputSchemaRef,
      middleware: [],
      tags: [entity.name],
      description: `${action.name} on ${entity.name}`,
      ...action,
    }));
}
```

**Collision detection** — `detectRouteCollisions(ir)`:
```typescript
export function detectRouteCollisions(ir: AppIR): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Map<string, SourceLocation>();

  // Collect all operationIds from module routes
  for (const mod of ir.modules) {
    if (mod.name === SYNTHETIC_MODULE) continue;
    for (const router of mod.routers) {
      for (const route of router.routes) {
        seen.set(route.operationId, route);
      }
    }
  }

  // Check entity routes for collisions
  const entityModule = ir.modules.find(m => m.name === SYNTHETIC_MODULE);
  if (entityModule) {
    for (const router of entityModule.routers) {
      for (const route of router.routes) {
        const existing = seen.get(route.operationId);
        if (existing) {
          diagnostics.push({
            code: 'ENTITY_ROUTE_COLLISION',
            severity: 'error',
            message: `Entity-generated operationId "${route.operationId}" collides with existing route at ${existing.sourceFile}:${existing.sourceLine}`,
            ...route,
          });
        }
        seen.set(route.operationId, route);
      }
    }
  }

  return diagnostics;
}
```

---

## Part 4: Codegen Integration

### File: `packages/codegen/src/types.ts`

Add entity types:
```typescript
export interface CodegenEntityModule {
  entityName: string;
  operations: CodegenEntityOperation[];
  actions: CodegenEntityAction[];
}

export interface CodegenEntityOperation {
  kind: 'list' | 'get' | 'create' | 'update' | 'delete';
  method: string;
  path: string;
  operationId: string;
  inputSchema?: string;
  outputSchema?: string;
}

export interface CodegenEntityAction {
  name: string;
  operationId: string;
  path: string;
  inputSchema?: string;
  outputSchema?: string;
}
```

Add to `CodegenIR`:
```typescript
export interface CodegenIR {
  // ... existing ...
  entities: CodegenEntityModule[];
}
```

### File: `packages/codegen/src/ir-adapter.ts`

Add entity processing after existing module processing:

```typescript
export function adaptIR(appIR: AppIR): CodegenIR {
  // ... existing code ...

  // Process entities into entity-specific codegen modules
  const entities: CodegenEntityModule[] = (appIR.entities ?? []).map(entity => {
    const entityPascal = toPascalCase(entity.name);

    const operations: CodegenEntityOperation[] = [];
    const crudOps = [
      { kind: 'list', method: 'GET', path: `/${entity.name}`, schema: 'response' },
      { kind: 'get', method: 'GET', path: `/${entity.name}/:id`, schema: 'response' },
      { kind: 'create', method: 'POST', path: `/${entity.name}`, schema: 'createInput' },
      { kind: 'update', method: 'PATCH', path: `/${entity.name}/:id`, schema: 'updateInput' },
      { kind: 'delete', method: 'DELETE', path: `/${entity.name}/:id`, schema: 'response' },
    ] as const;

    for (const op of crudOps) {
      const accessKind = entity.access[op.kind as keyof typeof entity.access];
      if (accessKind === 'false') continue;
      operations.push({
        kind: op.kind as CodegenEntityOperation['kind'],
        method: op.method,
        path: op.path,
        operationId: `${op.kind}${entityPascal}`,
        outputSchema: entity.modelRef.schemaRefs.resolved
          ? `${entityPascal}Response` : undefined,
        inputSchema: (op.kind === 'create' || op.kind === 'update')
          && entity.modelRef.schemaRefs.resolved
          ? `${op.kind === 'create' ? 'Create' : 'Update'}${entityPascal}Input` : undefined,
      });
    }

    const actions: CodegenEntityAction[] = entity.actions
      .filter(a => entity.access.custom[a.name] !== 'false')
      .map(a => ({
        name: a.name,
        operationId: `${a.name}${entityPascal}`,
        path: `/${entity.name}/:id/${a.name}`,
      }));

    return { entityName: entity.name, operations, actions };
  });

  return {
    basePath: appIR.app.basePath,
    version: appIR.app.version,
    modules: sortedModules,
    schemas: allSchemas,
    entities,
    auth: { schemes: [] },
  };
}
```

### File: `packages/codegen/src/generators/entity-sdk-generator.ts`

New generator that produces typed SDK client for entities:

```typescript
import type { CodegenEntityModule, CodegenIR, GeneratedFile, Generator, GeneratorConfig } from '../types';
import { toPascalCase } from '../utils/naming';

const FILE_HEADER = '// Generated by @vertz/codegen — do not edit\n\n';

export class EntitySdkGenerator implements Generator {
  readonly name = 'entity-sdk';

  generate(ir: CodegenIR, config: GeneratorConfig): GeneratedFile[] {
    if (!ir.entities?.length) return [];

    const files: GeneratedFile[] = [];

    // Individual entity SDK files
    for (const entity of ir.entities) {
      files.push(this.generateEntitySdk(entity, ir.basePath));
    }

    // Index file re-exporting all entities
    files.push(this.generateIndex(ir.entities));

    return files;
  }

  private generateEntitySdk(entity: CodegenEntityModule, basePath: string): GeneratedFile {
    const pascal = toPascalCase(entity.entityName);
    const lines: string[] = [FILE_HEADER];

    // Import types (when schema is resolved)
    const hasTypes = entity.operations.some(op => op.outputSchema || op.inputSchema);
    if (hasTypes) {
      const typeImports = new Set<string>();
      for (const op of entity.operations) {
        if (op.outputSchema) typeImports.add(op.outputSchema);
        if (op.inputSchema) typeImports.add(op.inputSchema);
      }
      lines.push(`import type { ${[...typeImports].join(', ')} } from '../types';`);
      lines.push(`import type { Client } from '../client';`);
      lines.push('');
    }

    // Generate SDK object
    lines.push(`export function create${pascal}Sdk(client: Client) {`);
    lines.push('  return {');

    for (const op of entity.operations) {
      const inputType = op.inputSchema ?? 'unknown';
      const outputType = op.outputSchema ?? 'unknown';
      const arrayOutput = op.kind === 'list' ? `${outputType}[]` : outputType;

      switch (op.kind) {
        case 'list':
          lines.push(`    list: (params?: Record<string, unknown>) => client.get<${arrayOutput}>('${op.path}', { params }),`);
          break;
        case 'get':
          lines.push(`    get: (id: string) => client.get<${outputType}>(\`${op.path.replace(':id', '${id}')}\`),`);
          break;
        case 'create':
          lines.push(`    create: (body: ${inputType}) => client.post<${outputType}>('${op.path}', body),`);
          break;
        case 'update':
          lines.push(`    update: (id: string, body: ${inputType}) => client.patch<${outputType}>(\`${op.path.replace(':id', '${id}')}\`, body),`);
          break;
        case 'delete':
          lines.push(`    delete: (id: string) => client.delete<${outputType}>(\`${op.path.replace(':id', '${id}')}\`),`);
          break;
      }
    }

    for (const action of entity.actions) {
      const inputType = action.inputSchema ?? 'unknown';
      const outputType = action.outputSchema ?? 'unknown';
      lines.push(`    ${action.name}: (id: string, body: ${inputType}) => client.post<${outputType}>(\`${action.path.replace(':id', '${id}')}\`, body),`);
    }

    lines.push('  };');
    lines.push('}');

    return {
      path: `entities/${entity.entityName}.ts`,
      content: lines.join('\n'),
    };
  }

  private generateIndex(entities: CodegenEntityModule[]): GeneratedFile {
    const lines: string[] = [FILE_HEADER];
    for (const entity of entities) {
      const pascal = toPascalCase(entity.entityName);
      lines.push(`export { create${pascal}Sdk } from './${entity.entityName}';`);
    }
    return { path: 'entities/index.ts', content: lines.join('\n') };
  }
}
```

---

## Part 5: Compiler Wiring

### File: `packages/compiler/src/compiler.ts`

1. Import EntityAnalyzer:
```typescript
import type { EntityAnalyzerResult } from './analyzers/entity-analyzer';
import { EntityAnalyzer } from './analyzers/entity-analyzer';
import { injectEntityRoutes, detectRouteCollisions } from './ir/entity-route-injector';
```

2. Add to `CompilerDependencies`:
```typescript
export interface CompilerDependencies {
  analyzers: {
    // ... existing ...
    entity: Analyzer<EntityAnalyzerResult>;
  };
  // ...
}
```

3. Update `analyze()`:
```typescript
async analyze(): Promise<AppIR> {
  const ir = createEmptyAppIR();
  // ... existing analyzer calls ...

  const entityResult = await analyzers.entity.analyze();
  ir.entities = entityResult.entities;

  // Inject entity routes into synthetic module for OpenAPI/route-table
  injectEntityRoutes(ir);

  // Check for collisions
  const collisionDiags = detectRouteCollisions(ir);
  ir.diagnostics.push(...collisionDiags);

  return enrichSchemasWithModuleNames(ir);
}
```

4. Update `createCompiler()`:
```typescript
const deps: CompilerDependencies = {
  analyzers: {
    // ... existing ...
    entity: new EntityAnalyzer(project, resolved),
  },
  // ...
};
```

---

## Part 6: Debug Output

When `process.env.VERTZ_DEBUG?.includes('entities')`, the analyzer logs:

```
[entity-analyzer] Scanning {n} source files...
[entity-analyzer] Detected entity: "{name}" at {file}:{line}
[entity-analyzer]   model: {variableName} (resolved: ✅/❌)
[entity-analyzer]   access: list ✓/✗, get ✓/✗, create ✓/✗, update ✓/✗, delete ✓/✗
[entity-analyzer]   hooks: before[{ops}], after[{ops}]
[entity-analyzer]   actions: {names}
[entity-analyzer] Routes generated: {n} ({operationIds})
[entity-analyzer] Routes skipped: {n} ({reasons})
```

Implementation: Add a `private debug(msg: string)` method that checks `process.env.VERTZ_DEBUG` and calls `console.log` with `[entity-analyzer]` prefix.

---

## Test Plan

All tests use TDD. Write test first, then implement.

### File: `packages/compiler/src/analyzers/__tests__/entity-analyzer.test.ts`

#### Detection Tests
1. Detects `entity('name', config)` with named import from `@vertz/server`
2. Detects with aliased import `import { entity as e } from '@vertz/server'`
3. Detects with namespace import `import * as server from '@vertz/server'` → `server.entity(...)`
4. Ignores `entity()` from other packages
5. Handles multiple entities in one file
6. Handles entities across multiple files
7. Emits `ENTITY_UNRESOLVED_IMPORT` for unresolvable entity calls

#### Name Extraction Tests
8. Extracts valid name from string literal
9. Emits `ENTITY_NON_LITERAL_NAME` for template literals or variables
10. Emits `ENTITY_INVALID_NAME` for names not matching pattern
11. Emits `ENTITY_DUPLICATE_NAME` for duplicate names across files

#### Model Extraction Tests
12. Extracts model variable name
13. Extracts model import source when imported
14. Resolves model schemas ($response, $create_input, $update_input) for simple variable
15. Resolves model schemas for imported model
16. Falls back to `resolved: false` for factory function without return type
17. Falls back to `resolved: false` for conditional expression
18. Emits `ENTITY_MISSING_MODEL` when model property absent
19. Emits `ENTITY_MODEL_UNRESOLVABLE` when type resolution fails

#### Access Extraction Tests
20. Extracts access rules: true → 'none', false → 'false', function → 'function'
21. Handles missing access (all 'none')
22. Handles partial access (some ops defined, rest 'none')
23. Extracts custom action access rules
24. Emits `ENTITY_UNKNOWN_ACCESS_OP` for unknown operation names

#### Hook Extraction Tests
25. Extracts before hooks (create, update)
26. Extracts after hooks (create, update, delete)
27. Handles missing hooks (empty arrays)

#### Action Extraction Tests
28. Extracts custom actions with input/output schema refs
29. Emits `ENTITY_ACTION_NAME_COLLISION` for action named 'create', 'update', etc.
30. Emits `ENTITY_ACTION_MISSING_SCHEMA` for actions without input/output
31. Handles empty actions object

#### Relation Extraction Tests
32. Extracts `true` as selection: 'all'
33. Extracts object with field keys as selection: string[]
34. Excludes `false` relations
35. Handles empty relations

#### Config Edge Cases
36. Emits `ENTITY_CONFIG_NOT_OBJECT` when config is a variable reference
37. Handles entity with no optional properties (just name + model)
38. Handles entity with ALL operations disabled → `ENTITY_NO_ROUTES`

### File: `packages/compiler/src/ir/__tests__/entity-route-injector.test.ts`

39. Generates 5 CRUD routes for basic entity
40. Skips routes where access is 'false'
41. Generates custom action routes
42. Skips custom action routes where access is 'false'
43. Sets correct operationId (camelCase with PascalCase entity)
44. Sets correct HTTP methods and paths
45. Includes schema refs on routes when model resolved
46. Omits schema refs when model unresolved
47. Detects operationId collision with module routes
48. Handles entity with all operations disabled (no routes injected)
49. Handles multiple entities (no cross-entity collisions)

### File: `packages/codegen/src/__tests__/ir-adapter-entities.test.ts`

50. Adapts EntityIR into CodegenEntityModule
51. Filters disabled operations
52. Includes custom actions
53. Sets schema names when resolved
54. Uses undefined schema names when unresolved
55. Handles empty entities array

### File: `packages/codegen/src/generators/__tests__/entity-sdk-generator.test.ts`

56. Generates typed SDK for entity with all CRUD operations
57. Generates SDK with custom actions
58. Generates SDK with `unknown` types when schemas unresolved
59. Generates index file re-exporting all entity SDKs
60. Handles entity with some CRUD disabled
61. Handles entity with only custom actions (no CRUD)

---

## Quality Gates

Before pushing:
1. `bun run ci` passes (full pipeline: typecheck + lint + all tests)
2. Zero skipped tests
3. All new files exported from package index
4. No `any` types in production code

## Acceptance Criteria

- [ ] `EntityAnalyzer` detects `entity()` calls with all import patterns
- [ ] `EntityIR` appears in `AppIR` after compilation
- [ ] Model schema resolution works for simple variable references
- [ ] Model schema resolution falls back gracefully with diagnostic
- [ ] Entity routes appear in OpenAPI output
- [ ] Entity SDK generator produces typed client methods
- [ ] All 61 tests pass
- [ ] `bun run ci` green
- [ ] `VERTZ_DEBUG=entities` shows detection/routing trace

---

## Addendum: Tech Lead Review Fixes

The following corrections address the 8 blocking issues from ben's review (`plans/reviews/entity-analyzer-impl-spec-review-tech-lead.md`).

### Fix 1: `toPascalCase` import in route injector

`entity-route-injector.ts` must import `toPascalCase`. Since this file is in `packages/compiler/`, not `packages/codegen/`, either:
- Copy the utility to `packages/compiler/src/utils/naming.ts`, OR
- Implement inline: `const toPascalCase = (s: string) => s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');`

Recommendation: inline utility in route injector (simple, no cross-package dependency).

### Fix 2: `extractActions` schema refs

Replace the placeholder schema refs with actual type resolution:

```typescript
private extractActions(configObj: ObjectLiteralExpression): EntityActionIR[] {
  const actionsExpr = getPropertyValue(configObj, 'actions');
  if (!actionsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

  return getProperties(actionsExpr).map(({ name, value }) => {
    const actionObj = value.isKind(SyntaxKind.ObjectLiteralExpression) ? value : null;
    const loc = getSourceLocation(value);

    const inputExpr = actionObj ? getPropertyValue(actionObj, 'input') : null;
    const outputExpr = actionObj ? getPropertyValue(actionObj, 'output') : null;

    if (!inputExpr || !outputExpr) {
      this.addDiagnostic({ code: 'ENTITY_ACTION_MISSING_SCHEMA', severity: 'warning',
        message: `Custom action "${name}" is missing input or output schema`, ...loc });
    }

    // Resolve actual schema types from the input/output expressions
    const inputSchemaRef: SchemaRef = inputExpr
      ? this.resolveSchemaFromExpression(inputExpr, loc)
      : { kind: 'inline', sourceFile: loc.sourceFile };
    const outputSchemaRef: SchemaRef = outputExpr
      ? this.resolveSchemaFromExpression(outputExpr, loc)
      : { kind: 'inline', sourceFile: loc.sourceFile };

    return { name, inputSchemaRef, outputSchemaRef, ...loc };
  });
}

// Resolve a schema expression (variable referencing a @vertz/schema definition)
private resolveSchemaFromExpression(expr: Expression, loc: SourceLocation): SchemaRef {
  if (expr.isKind(SyntaxKind.Identifier)) {
    const varName = expr.getText();
    // Try to find it as a named schema
    return { kind: 'named', schemaName: varName, sourceFile: loc.sourceFile };
  }
  // Fallback: inline with type text
  try {
    const typeText = expr.getType().getText();
    return { kind: 'inline', sourceFile: loc.sourceFile, jsonSchema: { __typeText: typeText } };
  } catch {
    return { kind: 'inline', sourceFile: loc.sourceFile };
  }
}
```

### Fix 3: `EntityHooksIR` — no type mismatch

The type is correct as-is: `before: ('create' | 'update')[]` and `after: ('create' | 'update' | 'delete')[]`. The implementation in `extractHooks` only pushes valid values because of the `if` checks. Unknown keys in the before/after objects are silently ignored — this is intentional (the runtime validates, the compiler just records).

No code change needed, but add a comment:
```typescript
// Only recognized hook operations are recorded. Unknown keys are ignored
// (runtime validates, compiler just records presence for diagnostics).
```

### Fix 4: `findImportForIdentifier` utility

Already imported in the fix to the import section (see updated imports above). This function exists in `packages/compiler/src/utils/import-resolver.ts` — the research confirmed its signature:

```typescript
function findImportForIdentifier(identifier: Identifier): ImportMatch | null
```

If it doesn't exist in the current codebase, implement:
```typescript
export function findImportForIdentifier(identifier: Identifier): ImportMatch | null {
  const sourceFile = identifier.getSourceFile();
  const name = identifier.getText();
  for (const importDecl of sourceFile.getImportDeclarations()) {
    // Check named imports
    for (const namedImport of importDecl.getNamedImports()) {
      if (namedImport.getAliasNode()?.getText() === name || namedImport.getName() === name) {
        return { importDecl, originalName: namedImport.getName() };
      }
    }
    // Check namespace import
    const nsImport = importDecl.getNamespaceImport();
    if (nsImport?.getText() === name) {
      return { importDecl, originalName: '*' };
    }
    // Check default import
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport?.getText() === name) {
      return { importDecl, originalName: 'default' };
    }
  }
  return null;
}
```

### Fix 5: `HttpMethod` import in route injector

Add to route injector imports:
```typescript
import type { AppIR, EntityIR, ModuleIR, RouterIR, RouteIR, HttpMethod, SourceLocation } from './types';
import type { Diagnostic } from '../errors';
```

### Fix 6: SchemaRef required fields

`SchemaRef` is a union type defined in `ir/types.ts`:
```typescript
export type SchemaRef = NamedSchemaRef | InlineSchemaRef;
export interface InlineSchemaRef { kind: 'inline'; sourceFile: string; jsonSchema?: Record<string, unknown>; }
export interface NamedSchemaRef { kind: 'named'; schemaName: string; sourceFile: string; jsonSchema?: Record<string, unknown>; }
```

The `jsonSchema` field is optional. Our `{ kind: 'inline', sourceFile: ... }` objects are valid. No fix needed, but the implementer should verify the actual `SchemaRef` type definition in the codebase.

### Fix 7: Duplicate name detection

Already implemented in the `analyze()` method (see Part 2, the `seenNames` Map). The spec shows:
```typescript
const seenNames = new Map<string, SourceLocation>();
// ... in loop:
const existing = seenNames.get(entity.name);
if (existing) {
  this.addDiagnostic({ code: 'ENTITY_DUPLICATE_NAME', ... });
  continue;
}
seenNames.set(entity.name, entity);
```

This is correct. Ben may have missed it in the analyze() method.

### Fix 8: `ENTITY_UNKNOWN_ACCESS_OP` emission

Update `extractAccess()` to emit the diagnostic:

```typescript
private extractAccess(configObj: ObjectLiteralExpression): EntityAccessIR {
  const defaults: EntityAccessIR = {
    list: 'none', get: 'none', create: 'none',
    update: 'none', delete: 'none', custom: {},
  };

  const accessExpr = getPropertyValue(configObj, 'access');
  if (!accessExpr || !accessExpr.isKind(SyntaxKind.ObjectLiteralExpression)) return defaults;

  const result = { ...defaults };
  const knownOps = new Set([...CRUD_OPS]);

  for (const { name, value } of getProperties(accessExpr)) {
    const kind = this.classifyAccessRule(value);
    if (knownOps.has(name)) {
      result[name as CrudOp] = kind;
    } else {
      // Custom action access — valid, record it
      result.custom[name] = kind;
      // Note: We don't warn here because custom action names are valid access keys.
      // ENTITY_UNKNOWN_ACCESS_OP is only emitted if the name doesn't match a CRUD op
      // AND doesn't match any action name. This cross-check happens in extractEntity()
      // after both access and actions are extracted.
    }
  }
  return result;
}
```

Add cross-validation in `extractEntity()` after both access and actions are extracted:
```typescript
// 6. Validate custom access ops match actual action names
for (const customOp of Object.keys(access.custom)) {
  if (!actions.some(a => a.name === customOp)) {
    this.addDiagnostic({ code: 'ENTITY_UNKNOWN_ACCESS_OP', severity: 'warning',
      message: `Unknown access operation "${customOp}" — not a CRUD op or custom action`, ...loc });
  }
}
```

### Additional test cases (from review)

Add to test plan:
- 62. `VERTZ_DEBUG=entities` produces expected log output
- 63. Empty file with no imports is skipped quickly (performance)
- 64. Malformed access property (non-object) is handled gracefully
- 65. Full pipeline integration: entity IR → codegen → SDK output file
- 66. `tableName` extraction from model (when statically determinable)
