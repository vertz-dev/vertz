/**
 * Convenience utility for creating a frozen bag of annotation constants.
 *
 * Usage:
 * ```typescript
 * const Annotation = defineAnnotations('sensitive', 'hidden', 'patchable');
 * // typeof Annotation = { readonly sensitive: 'sensitive'; readonly hidden: 'hidden'; readonly patchable: 'patchable' }
 *
 * d.text().is(Annotation.hidden);
 * ```
 */
export function defineAnnotations<const T extends readonly string[]>(
  ...annotations: T
): { readonly [K in T[number]]: K } {
  const result = {} as Record<string, string>;
  for (const annotation of annotations) {
    result[annotation] = annotation;
  }
  return Object.freeze(result) as { readonly [K in T[number]]: K };
}
