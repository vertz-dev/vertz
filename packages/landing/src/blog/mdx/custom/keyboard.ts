/**
 * Keyboard — inline <kbd> with monospace + border styling.
 *
 *   Press <Keyboard>Cmd</Keyboard>+<Keyboard>K</Keyboard> to open search.
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

export function Keyboard(props: Record<string, unknown>): string {
  const text = childrenToText(props.children);
  return `<kbd style="display:inline-block;font-family:'JetBrains Mono','JetBrains Mono Fallback',monospace;font-size:0.85em;padding:1px 6px;margin:0 2px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:4px;line-height:1.4;color:#e4e4e7">${escapeHtml(text)}</kbd>`;
}
