import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Accordion(props: Record<string, unknown>): string {
  const title = props.title ? String(props.title) : '';
  const children = childrenToString(props.children);
  return `<details data-accordion style="border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;padding:12px 16px;margin-bottom:8px"><summary style="cursor:pointer;font-weight:500">${escapeHtml(title)}</summary><div style="margin-top:8px">${children}</div></details>`;
}

export function AccordionGroup(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  return `<div data-accordion-group style="margin-bottom:16px">${children}</div>`;
}
