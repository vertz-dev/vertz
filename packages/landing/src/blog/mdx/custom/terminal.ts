/**
 * Terminal — renders shell output at MDX compile time.
 *
 *   <Terminal title="zsh">
 *   $ bun create vertz-app my-app
 *   ✓ Cloning template
 *   </Terminal>
 *
 * Lines starting with `$ ` are rendered with an accent-colored prompt.
 * Everything else is rendered muted, as command output. No runtime JS —
 * the "copy commands only" UX from the plan is deferred until we add
 * client-side hydration for code-block controls.
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
    // Strip any HTML tags a nested call produced — Terminal takes plain text.
    return String((children as { __html: string }).__html).replace(/<[^>]+>/g, '');
  }
  return '';
}

export function Terminal(props: Record<string, unknown>): string {
  const raw = childrenToText(props.children).trim();
  const title = typeof props.title === 'string' ? props.title : undefined;

  const titleBar = title
    ? `<div style="padding:8px 14px;background:rgba(255,255,255,0.04);font-size:0.8em;color:#a1a1aa;border-bottom:1px solid rgba(255,255,255,0.06)">${escapeHtml(title)}</div>`
    : '';

  const lines = raw
    .split('\n')
    .map((line) => {
      if (line.startsWith('$ ')) {
        const cmd = line.slice(2);
        return (
          `<div><span style="color:#fb923c;user-select:none">$ </span>` +
          `<span style="color:#e4e4e7">${escapeHtml(cmd)}</span></div>`
        );
      }
      if (line.length === 0) return '<div>&nbsp;</div>';
      return `<div style="color:#71717a">${escapeHtml(line)}</div>`;
    })
    .join('');

  return (
    `<div role="group" aria-label="Terminal" style="margin:1.5rem 0;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden;background:#18181b">` +
    titleBar +
    `<div style="padding:14px;font-family:'JetBrains Mono','JetBrains Mono Fallback',monospace;font-size:0.875rem;line-height:1.6;overflow-x:auto">${lines}</div>` +
    `</div>`
  );
}
