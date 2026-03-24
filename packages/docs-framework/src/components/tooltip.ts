import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Tooltip(props: Record<string, unknown>): string {
  const tip = props.tip ? String(props.tip) : '';
  const children = childrenToString(props.children);
  return `<span data-tooltip style="position:relative;border-bottom:1px dotted var(--docs-muted,#6b7280);cursor:help" title="${escapeHtml(tip)}">${children}<span data-tooltip-text style="display:none;position:absolute;bottom:100%;left:50%;transform:translateX(-50%);padding:4px 8px;font-size:12px;white-space:nowrap;background:#1f2937;color:white;border-radius:4px;pointer-events:none">${escapeHtml(tip)}</span></span>`;
}
