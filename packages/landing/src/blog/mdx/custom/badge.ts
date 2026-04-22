/**
 * Badge — inline pill used in prose to highlight a status.
 *
 *   <Badge intent="experimental">v0.2-beta</Badge>
 *   <Badge intent="stable">v1.0</Badge>
 *   <Badge intent="deprecated">v0.1</Badge>
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function childrenToText(children: unknown): string {
  if (children == null || children === false || children === true) return '';
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (typeof children === 'object' && children !== null && '__html' in children) {
    return String((children as { __html: string }).__html);
  }
  return '';
}

export type BadgeIntent = 'experimental' | 'stable' | 'deprecated';

const INTENT_STYLES: Record<BadgeIntent, { bg: string; color: string; extra?: string }> = {
  experimental: { bg: 'rgba(251,146,60,0.12)', color: '#fb923c' },
  stable: { bg: 'rgba(52,211,153,0.12)', color: '#34d399' },
  deprecated: { bg: 'rgba(113,113,122,0.18)', color: '#a1a1aa', extra: 'text-decoration:line-through' },
};

function normalizeIntent(raw: unknown): BadgeIntent {
  if (raw === 'stable' || raw === 'deprecated') return raw;
  return 'experimental';
}

export function Badge(props: Record<string, unknown>): string {
  const intent = normalizeIntent(props.intent);
  const style = INTENT_STYLES[intent];
  const extra = style.extra ? `;${style.extra}` : '';
  const text = childrenToText(props.children);
  return `<span data-badge="${intent}" style="display:inline-block;background:${style.bg};color:${style.color};font-size:0.8em;padding:1px 8px;border-radius:9999px;font-family:'JetBrains Mono','JetBrains Mono Fallback',monospace;line-height:1.4${extra}">${escapeHtml(text)}</span>`;
}
