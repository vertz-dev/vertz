import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Card(props: Record<string, unknown>): string {
  const title = props.title ? String(props.title) : '';
  const href = props.href ? String(props.href) : undefined;
  const children = childrenToString(props.children);

  const titleHtml = title
    ? `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>`
    : '';
  const inner = `${titleHtml}<div>${children}</div>`;

  if (href) {
    return `<a data-card href="${escapeHtml(href)}" style="display:block;text-decoration:none;color:inherit;border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;padding:16px;margin-bottom:12px">${inner}</a>`;
  }
  return `<div data-card style="border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;padding:16px;margin-bottom:12px">${inner}</div>`;
}

export function CardGroup(props: Record<string, unknown>): string {
  const cols = Number(props.cols) || 2;
  const children = childrenToString(props.children);
  return `<div data-card-group style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-bottom:16px">${children}</div>`;
}
