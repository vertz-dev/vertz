import { childrenToString } from './children';

export function CodeGroup(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  return `<div data-code-group style="border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;overflow:hidden;margin-bottom:16px">${children}</div>`;
}
