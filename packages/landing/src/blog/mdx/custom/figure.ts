/**
 * Figure — image with explicit width/height (required, to prevent CLS) plus
 * an optional caption. Rendered at MDX compile time as a static HTML string.
 *
 *   <Figure src="/blog/arch.png" alt="Architecture" caption="..." width={1600} height={900} />
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function requireString(props: Record<string, unknown>, key: string): string {
  const v = props[key];
  if (typeof v !== 'string' || !v) {
    throw new Error(`<Figure> missing required string prop "${key}"`);
  }
  return v;
}

function requireNumber(props: Record<string, unknown>, key: string): number {
  const v = props[key];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new Error(`<Figure> missing required positive number prop "${key}"`);
  }
  return v;
}

export function Figure(props: Record<string, unknown>): string {
  const src = requireString(props, 'src');
  const alt = requireString(props, 'alt');
  const width = requireNumber(props, 'width');
  const height = requireNumber(props, 'height');
  const caption = typeof props.caption === 'string' ? props.caption : undefined;

  const captionHtml = caption
    ? `<figcaption style="color:rgba(228,228,231,0.6);font-size:0.875rem;margin-top:0.75rem;text-align:center">${escapeHtml(caption)}</figcaption>`
    : '';

  return (
    `<figure style="margin:2rem 0;max-width:800px">` +
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" width="${width}" height="${height}" loading="lazy" style="display:block;width:100%;height:auto;border-radius:8px" />` +
    captionHtml +
    `</figure>`
  );
}
