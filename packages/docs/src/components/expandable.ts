import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Expandable(props: Record<string, unknown>): string {
  const title = props.title ? String(props.title) : 'Show more';
  const children = childrenToString(props.children);
  return `<details data-expandable style="margin-bottom:8px"><summary style="cursor:pointer;font-weight:500;font-size:14px;color:var(--docs-primary,#2563eb)">${escapeHtml(title)}</summary><div style="margin-top:8px;padding-left:12px">${children}</div></details>`;
}
