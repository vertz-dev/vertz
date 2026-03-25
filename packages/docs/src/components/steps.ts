import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Steps(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  return `<div data-steps style="margin-bottom:16px">${children}</div>`;
}

export function Step(props: Record<string, unknown>): string {
  const title = props.title ? String(props.title) : '';
  const children = childrenToString(props.children);
  return `<div data-step style="padding-left:24px;margin-bottom:16px;border-left:2px solid var(--docs-border,#e5e7eb)"><div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div><div>${children}</div></div>`;
}
