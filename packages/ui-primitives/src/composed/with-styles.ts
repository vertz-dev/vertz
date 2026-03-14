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
 * A composed primitive is a callable function with a `__classKeys` phantom brand
 * that defines the valid class keys for that component.
 */
export interface ComposedPrimitive<K extends string = string> {
  (props: {
    children?: ChildValue;
    classes?: Partial<Record<K, string>>;
    [key: string]: unknown;
  }): HTMLElement;
  __classKeys?: K;
}

/**
 * Extract the class keys from a composed primitive's phantom brand.
 */
export type ClassesOf<C> = C extends ComposedPrimitive<infer K> ? Record<K, string> : never;

/**
 * Return type of withStyles: a callable that accepts all props except `classes`,
 * plus all sub-component properties from the original component.
 */
export type StyledPrimitive<C extends ComposedPrimitive> = ((
  props: Omit<Parameters<C>[0], 'classes'>,
) => HTMLElement) &
  Omit<C, '__classKeys' | keyof CallableFunction>;

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
  const styled = (props: Omit<Parameters<C>[0], 'classes'>) =>
    component({ ...props, classes } as Parameters<C>[0]);

  // Copy all sub-component properties (Trigger, Content, Title, etc.)
  const subComponents: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(component)) {
    if (key !== 'length' && key !== 'name' && key !== 'prototype' && key !== '__classKeys') {
      subComponents[key] = (component as Record<string, unknown>)[key];
    }
  }

  return Object.assign(styled, subComponents) as StyledPrimitive<C>;
}
