/**
 * Joins class name fragments, filtering out falsy values.
 * Returns `undefined` when the result would be empty so that
 * `class={cn(...)}` doesn't render an empty attribute.
 */
export function cn(
  ...args: (string | undefined | null | false)[]
): string | undefined {
  const result = args.filter(Boolean).join(' ');
  return result || undefined;
}
