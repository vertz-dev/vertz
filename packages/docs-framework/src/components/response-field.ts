import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function ResponseField(props: Record<string, unknown>): string {
  const name = String(props.name ?? '');
  const type = props.type ? String(props.type) : '';
  const children = childrenToString(props.children);

  return `<div data-response-field style="border-left:2px solid var(--docs-border,#e5e7eb);padding:8px 0 8px 12px;margin-bottom:8px"><div style="display:flex;align-items:center;gap:8px"><code style="font-weight:600;font-size:14px">${escapeHtml(name)}</code><span style="font-size:13px;color:var(--docs-muted,#6b7280)">${escapeHtml(type)}</span></div><div style="margin-top:4px;font-size:14px;color:var(--docs-text,#374151)">${children}</div></div>`;
}
