import type {
  CallExpression,
  Expression,
  Identifier,
  ObjectLiteralExpression,
  SourceFile,
  Type,
} from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type {
  EntityAccessIR,
  EntityAccessRuleKind,
  EntityActionIR,
  EntityHooksIR,
  EntityIR,
  EntityModelRef,
  EntityModelSchemaRefs,
  EntityRelationIR,
  ResolvedField,
  SchemaRef,
  SourceLocation,
} from '../ir/types';
import {
  extractObjectLiteral,
  getBooleanValue,
  getProperties,
  getPropertyValue,
  getSourceLocation,
  getStringValue,
} from '../utils/ast-helpers';
import { isFromImport } from '../utils/import-resolver';
import { BaseAnalyzer } from './base-analyzer';

const ENTITY_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const CRUD_OPS = ['list', 'get', 'create', 'update', 'delete'] as const;
type CrudOp = (typeof CRUD_OPS)[number];

export interface EntityAnalyzerResult {
  entities: EntityIR[];
}

export class EntityAnalyzer extends BaseAnalyzer<EntityAnalyzerResult> {
  private debug(msg: string): void {
    if (process.env['VERTZ_DEBUG']?.includes('entities')) {
      console.log(`[entity-analyzer] ${msg}`);
    }
  }

  async analyze(): Promise<EntityAnalyzerResult> {
    const entities: EntityIR[] = [];
    const seenNames = new Map<string, SourceLocation>();

    const files = this.project.getSourceFiles();
    this.debug(`Scanning ${files.length} source files...`);

    for (const file of files) {
      // Find entity calls in all files (not just those importing from @vertz/server)
      // This allows us to emit diagnostics for unresolved entity calls
      const calls = this.findEntityCalls(file);
      for (const call of calls) {
        const entity = this.extractEntity(file, call);
        if (!entity) continue;

        // Check for duplicate names
        const existing = seenNames.get(entity.name);
        if (existing) {
          this.addDiagnostic({
            code: 'ENTITY_DUPLICATE_NAME',
            severity: 'error',
            message: `Entity "${entity.name}" is already defined at ${existing.sourceFile}:${existing.sourceLine}`,
            ...getSourceLocation(call),
          });
          continue;
        }

        seenNames.set(entity.name, entity);
        entities.push(entity);
        this.debug(
          `Detected entity: "${entity.name}" at ${entity.sourceFile}:${entity.sourceLine}`,
        );
        this.debug(
          `  model: ${entity.modelRef.variableName} (resolved: ${entity.modelRef.schemaRefs.resolved ? '✅' : '❌'})`,
        );

        const accessStatus = (CRUD_OPS as readonly string[])
          .map((op) => {
            const kind = entity.access[op as CrudOp];
            return `${op} ${kind === 'false' ? '✗' : '✓'}`;
          })
          .join(', ');
        this.debug(`  access: ${accessStatus}`);

        if (entity.hooks.before.length > 0 || entity.hooks.after.length > 0) {
          this.debug(
            `  hooks: before[${entity.hooks.before.join(',')}], after[${entity.hooks.after.join(',')}]`,
          );
        }

        if (entity.actions.length > 0) {
          this.debug(`  actions: ${entity.actions.map((a) => a.name).join(', ')}`);
        }
      }
    }

    return { entities };
  }

  private findEntityCalls(file: SourceFile): CallExpression[] {
    const validCalls: CallExpression[] = [];

    for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expr = call.getExpression();

      // Direct: entity(...) or aliased: myEntity(...)
      if (expr.isKind(SyntaxKind.Identifier)) {
        const isValid = isFromImport(expr, '@vertz/server');
        if (!isValid && expr.getText() === 'entity') {
          this.addDiagnostic({
            code: 'ENTITY_UNRESOLVED_IMPORT',
            severity: 'error',
            message: 'entity() call does not resolve to @vertz/server',
            ...getSourceLocation(call),
          });
          continue;
        }
        if (isValid) {
          validCalls.push(call);
        }
        continue;
      }

      // Namespace: server.entity(...)
      if (expr.isKind(SyntaxKind.PropertyAccessExpression)) {
        const propName = expr.getName();
        if (propName !== 'entity') continue;
        const obj = expr.getExpression();
        if (!obj.isKind(SyntaxKind.Identifier)) continue;
        // Check if the namespace import is from @vertz/server
        const sourceFile = obj.getSourceFile();
        const importDecl = sourceFile
          .getImportDeclarations()
          .find(
            (d) =>
              d.getModuleSpecifierValue() === '@vertz/server' &&
              d.getNamespaceImport()?.getText() === obj.getText(),
          );
        if (importDecl) {
          validCalls.push(call);
        }
      }
    }

    return validCalls;
  }

  private extractEntity(_file: SourceFile, call: CallExpression): EntityIR | null {
    const args = call.getArguments();
    const loc = getSourceLocation(call);

    // 1. Extract name (first arg, must be string literal)
    if (args.length < 2) {
      this.addDiagnostic({
        code: 'ENTITY_MISSING_ARGS',
        severity: 'error',
        message: 'entity() requires two arguments: name and config',
        ...loc,
      });
      return null;
    }
    const name = getStringValue(args[0] as Expression);
    if (name === null) {
      this.addDiagnostic({
        code: 'ENTITY_NON_LITERAL_NAME',
        severity: 'error',
        message: 'entity() name must be a string literal',
        ...loc,
      });
      return null;
    }
    if (!ENTITY_NAME_PATTERN.test(name)) {
      this.addDiagnostic({
        code: 'ENTITY_INVALID_NAME',
        severity: 'error',
        message: `Entity name must match /^[a-z][a-z0-9-]*$/. Got: "${name}"`,
        ...loc,
      });
      return null;
    }

    // 2. Extract config (second arg, must be object literal)
    const configObj = extractObjectLiteral(call, 1);
    if (!configObj) {
      this.addDiagnostic({
        code: 'ENTITY_CONFIG_NOT_OBJECT',
        severity: 'warning',
        message: 'entity() config must be an object literal for static analysis',
        ...loc,
      });
      return null;
    }

    // 3. Extract model reference
    const modelRef = this.extractModelRef(configObj, loc);
    if (!modelRef) return null; // diagnostic already emitted

    // 4. Extract access, hooks, actions, relations
    const access = this.extractAccess(configObj);
    const hooks = this.extractHooks(configObj);
    const actions = this.extractActions(configObj);
    const relations = this.extractRelations(configObj);

    // 5. Validate action names don't collide with CRUD ops
    for (const action of actions) {
      if ((CRUD_OPS as readonly string[]).includes(action.name)) {
        this.addDiagnostic({
          code: 'ENTITY_ACTION_NAME_COLLISION',
          severity: 'error',
          message: `Custom action "${action.name}" collides with built-in CRUD operation`,
          ...action,
        });
      }
    }

    // 6. Validate custom access ops match actual action names
    for (const customOp of Object.keys(access.custom)) {
      if (!actions.some((a) => a.name === customOp)) {
        this.addDiagnostic({
          code: 'ENTITY_UNKNOWN_ACCESS_OP',
          severity: 'warning',
          message: `Unknown access operation "${customOp}" — not a CRUD op or custom action`,
          ...loc,
        });
      }
    }

    return { name, modelRef, access, hooks, actions, relations, ...loc };
  }

  private extractModelRef(
    configObj: ObjectLiteralExpression,
    loc: SourceLocation,
  ): EntityModelRef | null {
    const modelExpr = getPropertyValue(configObj, 'model');
    if (!modelExpr) {
      this.addDiagnostic({
        code: 'ENTITY_MISSING_MODEL',
        severity: 'error',
        message: 'entity() requires a model property',
        ...loc,
      });
      return null;
    }

    const variableName = modelExpr.isKind(SyntaxKind.Identifier)
      ? modelExpr.getText()
      : modelExpr.getText();

    // Try to resolve import source
    let importSource: string | undefined;
    if (modelExpr.isKind(SyntaxKind.Identifier)) {
      const importInfo = this.findImportForIdentifier(modelExpr);
      if (importInfo) {
        importSource = importInfo.importDecl.getModuleSpecifierValue();
      }
    }

    // Resolve model schemas via ts-morph type system
    const schemaRefs = this.resolveModelSchemas(modelExpr);

    return { variableName, importSource, schemaRefs };
  }

  private findImportForIdentifier(identifier: Identifier) {
    const sourceFile = identifier.getSourceFile();
    const name = identifier.getText();

    for (const importDecl of sourceFile.getImportDeclarations()) {
      for (const specifier of importDecl.getNamedImports()) {
        const localName = specifier.getAliasNode()?.getText() ?? specifier.getName();
        if (localName === name) {
          return { importDecl, originalName: specifier.getName() };
        }
      }

      const nsImport = importDecl.getNamespaceImport();
      if (nsImport && nsImport.getText() === name) {
        return { importDecl, originalName: '*' };
      }
    }

    return null;
  }

  private resolveModelSchemas(modelExpr: Expression): EntityModelSchemaRefs {
    try {
      const modelType = modelExpr.getType();

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
    parentType: Type,
    propertyName: string,
    location: Expression,
  ): SchemaRef | undefined {
    const prop = parentType.getProperty(propertyName);
    if (!prop) return undefined;

    const propType = prop.getTypeAtLocation(location);

    // Try to resolve field-level info for downstream codegen
    const resolvedFields = this.resolveFieldsFromSchemaType(propType, location);

    // Generate proper JSON Schema from resolvedFields
    const jsonSchema = this.buildJsonSchema(resolvedFields);

    // Return as inline schema ref with the resolved schema
    return {
      kind: 'inline' as const,
      sourceFile: location.getSourceFile().getFilePath(),
      jsonSchema,
      resolvedFields,
    };
  }

  /**
   * Build JSON Schema from resolved fields.
   * Maps tsType ('string' | 'number' | 'boolean' | 'date' | 'unknown') to JSON Schema types.
   */
  private buildJsonSchema(
    resolvedFields: ResolvedField[] | undefined,
  ): Record<string, unknown> {
    if (!resolvedFields || resolvedFields.length === 0) {
      return {};
    }

    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const field of resolvedFields) {
      const fieldSchema = this.tsTypeToJsonSchema(field.tsType);
      properties[field.name] = fieldSchema;
      if (!field.optional) {
        required.push(field.name);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  /**
   * Map tsType to JSON Schema type.
   * Handles column types like text → string, boolean → boolean, uuid → string with format,
   * timestamp with time zone → string with date-time format, integer → integer, real/float → number.
   */
  private tsTypeToJsonSchema(
    tsType: ResolvedField['tsType'],
  ): Record<string, unknown> {
    switch (tsType) {
      case 'string':
        return { type: 'string' };
      case 'number':
        return { type: 'number' };
      case 'boolean':
        return { type: 'boolean' };
      case 'date':
        return { type: 'string', format: 'date-time' };
      case 'unknown':
      default:
        return {};
    }
  }

  /**
   * Navigate through SchemaLike<T> to extract T's field info.
   * SchemaLike<T> has parse(data: unknown): T — we get T from parse's return type.
   */
  private resolveFieldsFromSchemaType(
    schemaType: Type,
    location: Expression,
  ): ResolvedField[] | undefined {
    try {
      // Navigate: SchemaLike<T> → parse property → call signature → return type → T
      const parseProp = schemaType.getProperty('parse');
      if (!parseProp) return undefined;

      const parseType = parseProp.getTypeAtLocation(location);
      const callSignatures = parseType.getCallSignatures();
      if (callSignatures.length === 0) return undefined;

      const returnType = callSignatures[0]?.getReturnType();
      if (!returnType) return undefined;

      const properties = returnType.getProperties();
      if (properties.length === 0) return undefined;

      const fields: ResolvedField[] = [];
      for (const fieldProp of properties) {
        const name = fieldProp.getName();
        const fieldType = fieldProp.getTypeAtLocation(location);
        const optional = fieldProp.isOptional();
        const tsType = this.mapTsType(fieldType);
        fields.push({ name, tsType, optional });
      }

      return fields;
    } catch {
      return undefined;
    }
  }

  private mapTsType(type: Type): ResolvedField['tsType'] {
    const typeText = type.getText();

    // Handle optional types (unwrap undefined union)
    if (type.isUnion()) {
      const nonUndefined = type.getUnionTypes().filter((t) => !t.isUndefined());
      if (nonUndefined.length === 1 && nonUndefined[0]) {
        return this.mapTsType(nonUndefined[0]);
      }
    }

    if (type.isString() || type.isStringLiteral()) return 'string';
    if (type.isNumber() || type.isNumberLiteral()) return 'number';
    if (type.isBoolean() || type.isBooleanLiteral()) return 'boolean';
    if (typeText === 'Date') return 'date';

    return 'unknown';
  }

  private extractAccess(configObj: ObjectLiteralExpression): EntityAccessIR {
    const defaults: EntityAccessIR = {
      list: 'none',
      get: 'none',
      create: 'none',
      update: 'none',
      delete: 'none',
      custom: {},
    };

    const accessExpr = getPropertyValue(configObj, 'access');
    if (!accessExpr || !accessExpr.isKind(SyntaxKind.ObjectLiteralExpression)) return defaults;

    const result = { ...defaults };
    const knownOps = new Set([...CRUD_OPS]);

    // Only recognized hook operations are recorded. Unknown keys are ignored
    // (runtime validates, compiler just records presence for diagnostics).
    for (const { name, value } of getProperties(accessExpr)) {
      const kind = this.classifyAccessRule(value);
      if (knownOps.has(name as CrudOp)) {
        result[name as CrudOp] = kind;
      } else {
        // Custom action access — valid, record it
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

  private extractActions(configObj: ObjectLiteralExpression): EntityActionIR[] {
    const actionsExpr = getPropertyValue(configObj, 'actions');
    if (!actionsExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

    return getProperties(actionsExpr).map(({ name, value }) => {
      const actionObj = value.isKind(SyntaxKind.ObjectLiteralExpression) ? value : null;
      const loc = getSourceLocation(value);

      const inputExpr = actionObj ? getPropertyValue(actionObj, 'input') : null;
      const outputExpr = actionObj ? getPropertyValue(actionObj, 'output') : null;

      if (!inputExpr || !outputExpr) {
        this.addDiagnostic({
          code: 'ENTITY_ACTION_MISSING_SCHEMA',
          severity: 'warning',
          message: `Custom action "${name}" is missing input or output schema`,
          ...loc,
        });
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

  private extractRelations(configObj: ObjectLiteralExpression): EntityRelationIR[] {
    const relExpr = getPropertyValue(configObj, 'relations');
    if (!relExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) return [];

    return getProperties(relExpr)
      .filter(({ value }) => {
        const boolVal = getBooleanValue(value);
        return boolVal !== false; // false means excluded
      })
      .map(({ name, value }) => {
        const boolVal = getBooleanValue(value);
        if (boolVal === true) return { name, selection: 'all' as const };

        // Object literal with field keys
        if (value.isKind(SyntaxKind.ObjectLiteralExpression)) {
          const fields = getProperties(value).map((p) => p.name);
          return { name, selection: fields };
        }

        return { name, selection: 'all' as const };
      });
  }
}
