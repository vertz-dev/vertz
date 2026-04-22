/**
 * Dark-theme Callout for the blog. Rendered at MDX compile time as an
 * HTML string via the string JSX shim; no runtime JS required.
 *
 *   <Callout type="warn" title="Heads up">
 *     Breaking change in 0.2.
 *   </Callout>
 */

function childrenToString(children: unknown): string {
  if (children == null || children === false || children === true) return '';
  if (Array.isArray(children)) return children.map(childrenToString).join('');
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  return String(children);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type CalloutType = 'note' | 'tip' | 'warn' | 'warning' | 'info' | 'danger' | 'check';

// Tuned for the zinc / orange dark palette used by the landing.
const CALLOUT_STYLES: Record<
  Exclude<CalloutType, 'warning'>,
  { border: string; bg: string; icon: string; accent: string }
> = {
  note: {
    border: 'rgba(96, 165, 250, 0.6)',
    bg: 'rgba(96, 165, 250, 0.08)',
    icon: 'ℹ',
    accent: '#60a5fa',
  },
  tip: {
    border: 'rgba(52, 211, 153, 0.6)',
    bg: 'rgba(52, 211, 153, 0.08)',
    icon: '💡',
    accent: '#34d399',
  },
  warn: {
    border: 'rgba(251, 191, 36, 0.6)',
    bg: 'rgba(251, 191, 36, 0.08)',
    icon: '⚠',
    accent: '#fbbf24',
  },
  info: {
    border: 'rgba(34, 211, 238, 0.6)',
    bg: 'rgba(34, 211, 238, 0.08)',
    icon: 'ℹ',
    accent: '#22d3ee',
  },
  danger: {
    border: 'rgba(248, 113, 113, 0.6)',
    bg: 'rgba(248, 113, 113, 0.08)',
    icon: '🚨',
    accent: '#f87171',
  },
  check: {
    border: 'rgba(52, 211, 153, 0.6)',
    bg: 'rgba(52, 211, 153, 0.08)',
    icon: '✓',
    accent: '#34d399',
  },
};

function normalizeType(raw: string): Exclude<CalloutType, 'warning'> {
  if (raw === 'warning') return 'warn';
  if (raw in CALLOUT_STYLES) return raw as Exclude<CalloutType, 'warning'>;
  return 'note';
}

export function Callout(props: Record<string, unknown>): string {
  const type = normalizeType(String(props.type ?? 'note'));
  const title = typeof props.title === 'string' ? props.title : undefined;
  const style = CALLOUT_STYLES[type];
  const children = childrenToString(props.children);

  const titleHtml = title
    ? `<div style="color:${style.accent};font-weight:600;margin-bottom:4px;letter-spacing:0.02em">${escapeHtml(title)}</div>`
    : '';

  return `<div data-callout="${escapeHtml(type)}" style="border-left:3px solid ${style.border};background:${style.bg};padding:12px 20px;border-radius:8px;margin:1.5rem 0;color:#d4d4d8"><div style="display:flex;gap:10px"><span aria-hidden="true" style="flex-shrink:0;color:${style.accent}">${style.icon}</span><div style="flex:1;min-width:0">${titleHtml}${children}</div></div></div>`;
}
