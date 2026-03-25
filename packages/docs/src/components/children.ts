/**
 * Convert JSX children (from the string-based MDX runtime) to a string.
 */
export function childrenToString(children: unknown): string {
  if (children == null || children === false || children === true) return '';
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToString).join('');
  return String(children);
}
