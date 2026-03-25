import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function ParamField(props: Record<string, unknown>): string {
  const name = String(props.name ?? '');
  const type = props.type ? String(props.type) : '';
  const required = props.required === true || props.required === 'true';
  const location = props.location ? String(props.location) : '';
  const children = childrenToString(props.children);

  const badges: string[] = [];
  if (required) {
    badges.push(
      '<span style="font-size:11px;font-weight:600;color:#dc2626;background:#fef2f2;padding:1px 6px;border-radius:4px">Required</span>',
    );
  }
  if (location) {
    badges.push(
      `<span style="font-size:11px;font-weight:500;color:var(--docs-muted,#6b7280);background:var(--docs-primary-bg,#f1f5f9);padding:1px 6px;border-radius:4px">${escapeHtml(location)}</span>`,
    );
  }

  return `<div data-param-field style="border-bottom:1px solid var(--docs-border,#e5e7eb);padding:12px 0"><div style="display:flex;align-items:center;gap:8px"><code style="font-weight:600;font-size:14px">${escapeHtml(name)}</code><span style="font-size:13px;color:var(--docs-muted,#6b7280)">${escapeHtml(type)}</span>${badges.join('')}</div><div style="margin-top:4px;font-size:14px;color:var(--docs-text,#374151)">${children}</div></div>`;
}
