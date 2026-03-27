import { escapeHtml } from '../dev/escape-html';
import { childrenToString } from './children';

/**
 * Extract individual code block sections from the children HTML.
 * Each code block is wrapped in `<div data-code-block ...>...</div>` by rehype-enhanced-code.
 */
function extractCodeBlocks(html: string): string[] {
  const blocks: string[] = [];
  const marker = '<div data-code-block';
  let pos = 0;

  while (pos < html.length) {
    const start = html.indexOf(marker, pos);
    if (start === -1) break;

    // Count div open/close tags to find the matching </div>
    let depth = 0;
    let i = start;
    while (i < html.length) {
      const openIdx = html.indexOf('<div', i);
      const closeIdx = html.indexOf('</div>', i);

      if (openIdx === -1 && closeIdx === -1) break;

      if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
        depth++;
        i = openIdx + 4;
      } else {
        depth--;
        if (depth === 0) {
          blocks.push(html.slice(start, closeIdx + 6));
          pos = closeIdx + 6;
          break;
        }
        i = closeIdx + 6;
      }
    }

    if (depth !== 0) break;
  }

  return blocks;
}

/**
 * Extract the title text from a code block's data-code-title element.
 * Falls back to the language class name if no title is present.
 */
function extractTitle(blockHtml: string): string {
  const titleMatch = blockHtml.match(/<div data-code-title[^>]*>([^<]+)<\/div>/);
  if (titleMatch?.[1]) return titleMatch[1];

  const langMatch = blockHtml.match(/class="language-(\w+)"/);
  if (langMatch?.[1]) return langMatch[1];

  return 'Code';
}

/**
 * Remove the data-code-title div from a code block (titles are shown in the tab bar instead).
 * Also remove border/margin from code block wrapper since the group provides its own border.
 */
function stripBlockChrome(blockHtml: string): string {
  // Remove data-code-title div
  let result = blockHtml.replace(/<div data-code-title[^>]*>[^<]*<\/div>/, '');
  // Remove border, border-radius, and margin-bottom from the code-block wrapper
  result = result.replace(
    /margin-bottom:16px;border:1px solid var\(--docs-border,#e5e7eb\);border-radius:8px;/,
    '',
  );
  return result;
}

/** Inline JS handler for tab switching. Uses IIFE to avoid polluting global scope. */
function tabClickHandler(index: number): string {
  return [
    `(function(g,idx){`,
    `g.querySelectorAll('[data-code-group-panel]').forEach(function(p,j){p.style.display=j===idx?'':'none'});`,
    `g.querySelectorAll('[data-code-group-tab]').forEach(function(t,j){`,
    `t.setAttribute('aria-selected',j===idx?'true':'false');`,
    `t.style.borderBottomColor=j===idx?'var(--docs-primary,#2563eb)':'transparent';`,
    `t.style.color=j===idx?'var(--docs-primary,#2563eb)':'var(--docs-muted,#6b7280)'`,
    `})`,
    `})(this.closest('[data-code-group]'),${index})`,
  ].join('');
}

export function CodeGroup(props: Record<string, unknown>): string {
  const children = childrenToString(props.children);
  const blocks = extractCodeBlocks(children);

  // Fallback: no code blocks found, render as plain wrapper
  if (blocks.length === 0) {
    return `<div data-code-group style="border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;overflow:hidden;margin-bottom:16px">${children}</div>`;
  }

  const titles = blocks.map(extractTitle);

  // Build tab bar
  const tabs = titles
    .map((title, i) => {
      const selected = i === 0;
      const borderColor = selected ? 'var(--docs-primary,#2563eb)' : 'transparent';
      const textColor = selected ? 'var(--docs-primary,#2563eb)' : 'var(--docs-muted,#6b7280)';
      return `<button type="button" role="tab" aria-selected="${selected}" data-code-group-tab onclick="${escapeHtml(tabClickHandler(i))}" style="padding:8px 16px;font-size:13px;font-family:monospace;background:none;border:none;border-bottom:2px solid ${borderColor};color:${textColor};cursor:pointer">${escapeHtml(title)}</button>`;
    })
    .join('');

  const tabBar = `<div data-code-group-tabs role="tablist" style="display:flex;border-bottom:1px solid var(--docs-border,#e5e7eb);background:var(--docs-primary-bg,#f8fafc)">${tabs}</div>`;

  // Build panels — strip title bar and outer chrome from each block
  const panels = blocks
    .map((block, i) => {
      const cleaned = stripBlockChrome(block);
      const style = i === 0 ? '' : ' style="display:none"';
      return `<div role="tabpanel" data-code-group-panel${style}>${cleaned}</div>`;
    })
    .join('');

  return `<div data-code-group style="border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;overflow:hidden;margin-bottom:16px">${tabBar}${panels}</div>`;
}
