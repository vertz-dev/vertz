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
 * - Incremental updates for HMR
 * - Conservative fallback for unresolvable imports
 */
import type { ComponentPropFields, PropFieldAccess } from '@vertz/ui-compiler';
import { analyzeComponentPropFields } from '@vertz/ui-compiler';

export interface ResolvedPropFields {
  fields: string[];
  hasOpaqueAccess: boolean;
}

type ImportResolver = (specifier: string, fromFile: string) => string | undefined;

/**
 * Cross-file field selection manifest.
 */
export class FieldSelectionManifest {
  /** filePath → ComponentPropFields[] */
  private fileComponents = new Map<string, ComponentPropFields[]>();
  private importResolver: ImportResolver = () => undefined;
  /** Cache for resolved fields (cleared on updates) */
  private resolvedCache = new Map<string, ResolvedPropFields>();

  setImportResolver(resolver: ImportResolver): void {
    this.importResolver = resolver;
  }

  /**
   * Register a file's component prop fields.
   * Called during initial scan and incremental updates.
   */
  registerFile(filePath: string, sourceText: string): void {
    const components = analyzeComponentPropFields(filePath, sourceText);
    this.fileComponents.set(filePath, components);
    this.resolvedCache.clear();
  }

  /**
   * Update a file and return whether its component prop fields changed.
   */
  updateFile(filePath: string, sourceText: string): { changed: boolean } {
    const oldComponents = this.fileComponents.get(filePath);
    const newComponents = analyzeComponentPropFields(filePath, sourceText);

    const changed = !componentsEqual(oldComponents, newComponents);
    if (changed) {
      this.fileComponents.set(filePath, newComponents);
      this.resolvedCache.clear();
    }

    return { changed };
  }

  /**
   * Remove a file from the manifest.
   */
  deleteFile(filePath: string): void {
    this.fileComponents.delete(filePath);
    this.resolvedCache.clear();
  }

  /**
   * Get raw (non-transitively-resolved) component prop fields.
   */
  getComponentPropFields(
    filePath: string,
    componentName: string,
    propName: string,
  ): PropFieldAccess | undefined {
    const components = this.fileComponents.get(filePath);
    if (!components) return undefined;

    const component = components.find((c) => c.componentName === componentName);
    if (!component) return undefined;

    return component.props[propName];
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
    }
  }

  return true;
}
