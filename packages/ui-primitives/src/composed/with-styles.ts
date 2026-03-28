/**
 * withStyles() — Pre-binds CSS classes onto a composed primitive.
 * Themes use this to create styled versions of primitives without
 * duplicating behavioral logic.
 */

import type { ChildValue } from '@vertz/ui';

// ---------------------------------------------------------------------------
// Type infrastructure
// ---------------------------------------------------------------------------

/**
 * A composed primitive is a callable function with phantom brands
 * that define the valid class keys and element return type for that component.
 */
export interface ComposedPrimitive<K extends string = string, E extends Element = HTMLElement> {
  (props: {
    children?: ChildValue;
    classes?: Partial<Record<K, string>>;
    [key: string]: unknown;
  }): E;
  __classKeys?: K;
  __elementType?: E;
}

/**
 * Extract the class keys from a composed primitive's phantom brand.
 */
export type ClassesOf<C> = C extends ComposedPrimitive<infer K> ? Record<K, string> : never;

/**
 * Extract the element return type from a composed primitive's phantom brand.
 */
export type ElementOf<C> = C extends ComposedPrimitive<string, infer E> ? E : HTMLElement;

/**
 * Return type of withStyles: a callable that accepts all props except `classes`,
 * plus all sub-component properties from the original component.
 * Preserves the element return type from the underlying composed primitive.
 */
export type StyledPrimitive<C extends ComposedPrimitive> = ((
  props: Omit<Parameters<C>[0], 'classes'>,
) => ElementOf<C>) &
  Omit<C, '__classKeys' | '__elementType' | keyof CallableFunction>;

// ---------------------------------------------------------------------------
// withStyles
// ---------------------------------------------------------------------------

/**
 * Pre-bind CSS classes onto a composed primitive.
 * Returns a new function that accepts all props except `classes`,
 * with all sub-component properties preserved.
 */
export function withStyles<C extends ComposedPrimitive>(
  component: C,
  classes: ClassesOf<C>,
): StyledPrimitive<C> {
  if (!component) {
    throw new Error(
      'withStyles() received an undefined component. ' +
        'This usually means a composed primitive failed to load in the client bundle. ' +
        'Check that @vertz/ui-primitives is installed and its exports resolve correctly.',
    );
  }
  const styled = (props: Omit<Parameters<C>[0], 'classes'>) =>
    component({ ...props, classes } as Parameters<C>[0]);

  // Copy all sub-component properties (Trigger, Content, Title, etc.)
  const subComponents: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(component)) {
    if (
      key !== 'length' &&
      key !== 'name' &&
      key !== 'prototype' &&
      key !== '__classKeys' &&
      key !== '__elementType'
    ) {
      subComponents[key] = (component as Record<string, unknown>)[key];
    }
  }

  return Object.assign(styled, subComponents) as StyledPrimitive<C>;
}
