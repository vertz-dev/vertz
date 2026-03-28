import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';
import { Icon } from './icon';

export function Steps(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  return `<div data-steps style="margin-bottom:16px">${children}</div>`;
}

export function Step(props: Record<string, unknown>): string {
  const title = props.title ? String(props.title) : '';
  const icon = props.icon ? String(props.icon) : undefined;
  const children = childrenToString(props.children);
  const iconHtml = icon ? `${Icon({ name: icon, size: '16' })} ` : '';
  return `<div data-step style="padding-left:24px;margin-bottom:16px;border-left:2px solid var(--docs-border,#e5e7eb)"><div style="display:flex;align-items:center;gap:8px;font-weight:600;margin-bottom:4px">${iconHtml}${escapeHtml(title)}</div><div>${children}</div></div>`;
}
