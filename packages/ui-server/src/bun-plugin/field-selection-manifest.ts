/**
 * Field selection manifest — cross-file mapping of component → prop → accessed fields.
 *
 * Built at plugin construction time by scanning all .tsx files.
 * Provides lookup for the field selection injector to merge child component
 * fields into parent query selects.
 *
 * Supports:
 * - Direct field access on props
 * - Transitive resolution through prop forwarding chains (A → B → C)
 * - Re-export following (barrel files → defining files)
 * - Incremental updates for HMR
 * - Conservative fallback for unresolvable imports
 */
import type { ComponentPropFields, PropFieldAccess } from '../compiler/component-prop-field-analyzer';
import { analyzeComponentPropFields } from '../compiler/component-prop-field-analyzer';
import { ts } from 'ts-morph';

export interface ResolvedPropFields {
  fields: string[];
  hasOpaqueAccess: boolean;
}

export interface ReExportEntry {
  /** Exported name (or '*' for star re-exports) */
  name: string;
  /** Original name in the source module (differs from `name` for `export { A as B }`) */
  originalName: string;
  /** Import specifier (e.g., './issue-row') */
  source: string;
}

type ImportResolver = (specifier: string, fromFile: string) => string | undefined;

/** Fast regex check for re-export patterns — avoids full parse for non-barrel files. */
const RE_EXPORT_PATTERN = /export\s+(?:\{|\*)\s*.*?\bfrom\b/;

/**
 * Parse re-export statements from source text.
 * Detects: `export { Foo } from './bar'`, `export { A as B } from './bar'`,
 * and `export * from './bar'`.
 */
function parseReExports(sourceText: string, filePath: string): ReExportEntry[] {
  if (!RE_EXPORT_PATTERN.test(sourceText)) return [];

  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const reExports: ReExportEntry[] = [];

  for (const stmt of sourceFile.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier) continue;
    const source = stmt.moduleSpecifier.getText(sourceFile).replace(/^['"]|['"]$/g, '');

    if (!stmt.exportClause) {
      // export * from './bar'
      reExports.push({ name: '*', originalName: '*', source });
    } else if (ts.isNamedExports(stmt.exportClause)) {
      // export { Foo } from './bar' or export { Foo as Bar } from './bar'
      for (const el of stmt.exportClause.elements) {
        const exportedName = el.name.getText(sourceFile);
        // propertyName is set when using `as` alias: export { Original as Alias }
        const originalName = el.propertyName ? el.propertyName.getText(sourceFile) : exportedName;
        reExports.push({ name: exportedName, originalName, source });
      }
    }
  }

  return reExports;
}

/**
 * Cross-file field selection manifest.
 */
export class FieldSelectionManifest {
  /** filePath → ComponentPropFields[] */
  private fileComponents = new Map<string, ComponentPropFields[]>();
  /** filePath → ReExportEntry[] */
  private fileReExports = new Map<string, ReExportEntry[]>();
  private importResolver: ImportResolver = () => undefined;
  /** Cache for resolved fields (cleared on updates) */
  private resolvedCache = new Map<string, ResolvedPropFields>();

  setImportResolver(resolver: ImportResolver): void {
    this.importResolver = resolver;
  }

  /**
   * Register a file's component prop fields and re-exports.
   * Called during initial scan and incremental updates.
   */
  registerFile(filePath: string, sourceText: string): void {
    const components = analyzeComponentPropFields(filePath, sourceText);
    this.fileComponents.set(filePath, components);
    const reExports = parseReExports(sourceText, filePath);
    this.fileReExports.set(filePath, reExports);
    this.resolvedCache.clear();
  }

  /**
   * Update a file and return whether its component prop fields changed.
   */
  updateFile(filePath: string, sourceText: string): { changed: boolean } {
    const oldComponents = this.fileComponents.get(filePath);
    const newComponents = analyzeComponentPropFields(filePath, sourceText);

    const componentsChanged = !componentsEqual(oldComponents, newComponents);
    if (componentsChanged) {
      this.fileComponents.set(filePath, newComponents);
    }

    const oldReExports = this.fileReExports.get(filePath);
    const newReExports = parseReExports(sourceText, filePath);
    const reExportsChanged = !reExportsEqual(oldReExports, newReExports);
    if (reExportsChanged) {
      this.fileReExports.set(filePath, newReExports);
    }

    const changed = componentsChanged || reExportsChanged;
    if (changed) {
      this.resolvedCache.clear();
    }

    return { changed };
  }

  /**
   * Remove a file from the manifest.
   */
  deleteFile(filePath: string): void {
    this.fileComponents.delete(filePath);
    this.fileReExports.delete(filePath);
    this.resolvedCache.clear();
  }

  /**
   * Get raw (non-transitively-resolved) component prop fields.
   * Follows re-exports if the component isn't directly defined in the file.
   */
  getComponentPropFields(
    filePath: string,
    componentName: string,
    propName: string,
  ): PropFieldAccess | undefined {
    // Direct lookup
    const components = this.fileComponents.get(filePath);
    if (components) {
      const component = components.find((c) => c.componentName === componentName);
      if (component) return component.props[propName];
    }

    // Follow re-exports
    return this.followReExports(filePath, componentName, propName, new Set());
  }

  /**
   * Follow re-export chains to find the defining file of a component.
   * Handles renamed re-exports: `export { Internal as Public } from './bar'`
   * by using `originalName` to look up the component in the target file.
   */
  private followReExports(
    filePath: string,
    componentName: string,
    propName: string,
    visited: Set<string>,
  ): PropFieldAccess | undefined {
    if (visited.has(filePath)) return undefined; // Circular
    visited.add(filePath);

    const reExports = this.fileReExports.get(filePath);
    if (!reExports) return undefined;

    for (const re of reExports) {
      // Match named re-export or star re-export
      if (re.name !== componentName && re.name !== '*') continue;

      const targetPath = this.importResolver(re.source, filePath);
      if (!targetPath) continue;

      // For renamed re-exports (export { A as B }), look up using the original name
      // For star re-exports, use the component name as-is
      const targetName = re.name === '*' ? componentName : re.originalName;

      // Try direct lookup at the target
      const targetComponents = this.fileComponents.get(targetPath);
      if (targetComponents) {
        const component = targetComponents.find((c) => c.componentName === targetName);
        if (component) return component.props[propName];
      }

      // Recurse for chained re-exports (using the target name)
      const result = this.followReExports(targetPath, targetName, propName, visited);
      if (result) return result;
    }

    return undefined;
  }

  /**
   * Get transitively-resolved prop fields — follows forwarding chains.
   * Returns combined fields from direct access + forwarded children.
   * Marks as opaque if any forwarded target can't be resolved.
   */
  getResolvedPropFields(
    filePath: string,
    componentName: string,
    propName: string,
  ): ResolvedPropFields | undefined {
    const cacheKey = `${filePath}::${componentName}::${propName}`;
    if (this.resolvedCache.has(cacheKey)) {
      return this.resolvedCache.get(cacheKey);
    }

    const result = this.resolveFields(filePath, componentName, propName, new Set());
    if (result) {
      this.resolvedCache.set(cacheKey, result);
    }
    return result;
  }

  private resolveFields(
    filePath: string,
    componentName: string,
    propName: string,
    visited: Set<string>,
  ): ResolvedPropFields | undefined {
    const visitKey = `${filePath}::${componentName}::${propName}`;
    if (visited.has(visitKey)) return undefined; // Circular
    visited.add(visitKey);

    const access = this.getComponentPropFields(filePath, componentName, propName);
    if (!access) return undefined;

    const allFields = new Set(access.fields);
    let hasOpaqueAccess = access.hasOpaqueAccess;

    // Resolve forwarded props transitively
    for (const forward of access.forwarded) {
      const targetPath = forward.importSource
        ? this.importResolver(forward.importSource, filePath)
        : undefined;

      if (!targetPath) {
        // Can't resolve the import → conservative fallback
        hasOpaqueAccess = true;
        continue;
      }

      const childFields = this.resolveFields(
        targetPath,
        forward.componentName,
        forward.propName,
        visited,
      );

      if (childFields) {
        for (const field of childFields.fields) {
          allFields.add(field);
        }
        if (childFields.hasOpaqueAccess) {
          hasOpaqueAccess = true;
        }
      }
    }

    return { fields: [...allFields], hasOpaqueAccess };
  }
}

/**
 * Compare two component arrays for equality.
 */
function componentsEqual(a: ComponentPropFields[] | undefined, b: ComponentPropFields[]): boolean {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const ac = a[i]!;
    const bc = b[i]!;
    if (ac.componentName !== bc.componentName) return false;

    const aProps = Object.keys(ac.props).sort();
    const bProps = Object.keys(bc.props).sort();
    if (aProps.length !== bProps.length) return false;

    for (let j = 0; j < aProps.length; j++) {
      const aKey = aProps[j]!;
      const bKey = bProps[j]!;
      if (aKey !== bKey) return false;
      const aProp = ac.props[aKey]!;
      const bProp = bc.props[bKey]!;
      if (aProp.hasOpaqueAccess !== bProp.hasOpaqueAccess) return false;
      if (aProp.fields.length !== bProp.fields.length) return false;
      const aFieldsSorted = [...aProp.fields].sort();
      const bFieldsSorted = [...bProp.fields].sort();
      for (let k = 0; k < aFieldsSorted.length; k++) {
        if (aFieldsSorted[k] !== bFieldsSorted[k]) return false;
      }
      // Compare forwarded props
      if (aProp.forwarded.length !== bProp.forwarded.length) return false;
      for (let f = 0; f < aProp.forwarded.length; f++) {
        const af = aProp.forwarded[f]!;
        const bf = bProp.forwarded[f]!;
        if (af.componentName !== bf.componentName) return false;
        if (af.importSource !== bf.importSource) return false;
        if (af.propName !== bf.propName) return false;
      }
    }
  }

  return true;
}

/**
 * Compare two re-export arrays for equality.
 */
function reExportsEqual(a: ReExportEntry[] | undefined, b: ReExportEntry[]): boolean {
  if (!a) return b.length === 0;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.name !== b[i]!.name) return false;
    if (a[i]!.originalName !== b[i]!.originalName) return false;
    if (a[i]!.source !== b[i]!.source) return false;
  }
  return true;
}
