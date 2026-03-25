import { escapeHtml } from '../dev/escape-html';

/**
 * Icon component that renders a named icon.
 * Uses lucide-static for SVG icons when available,
 * falls back to a text placeholder.
 */
export function Icon(props: Record<string, unknown>): string {
  const name = String(props.name ?? '');
  const size = String(Number.parseInt(String(props.size ?? '16'), 10) || 16);

  // Try to load from lucide-static
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const icons = require('lucide-static');
    const iconKey = toPascalCase(name);
    if (icons[iconKey]) {
      return `<span data-icon="${escapeHtml(name)}" style="display:inline-flex;width:${size}px;height:${size}px">${icons[iconKey]}</span>`;
    }
  } catch {
    // lucide-static not available, fall through to placeholder
  }

  // Fallback: render as a text indicator
  return `<span data-icon="${escapeHtml(name)}" style="display:inline-flex;align-items:center;font-size:${size}px" aria-label="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
}

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');
}
