import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

export function Frame(props: Record<string, unknown>): string {
  const caption = props.caption ? String(props.caption) : undefined;
  const children = childrenToString(props.children);

  let captionHtml = '';
  if (caption) {
    captionHtml = `<figcaption style="text-align:center;font-size:13px;color:var(--docs-muted,#6b7280);margin-top:8px">${escapeHtml(caption)}</figcaption>`;
  }

  return `<figure data-frame style="border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;overflow:hidden;margin-bottom:16px"><div style="padding:16px">${children}</div>${captionHtml}</figure>`;
}
