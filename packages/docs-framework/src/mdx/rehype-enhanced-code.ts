import type { Element, Root, Text } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * Parse code fence meta string for enhanced features.
 * Supports: title="file.ts", {3-5,8}, showLineNumbers
 */
export function parseMeta(meta: string): {
  title?: string;
  highlightLines: number[];
  showLineNumbers: boolean;
} {
  let title: string | undefined;
  const highlightLines: number[] = [];
  let showLineNumbers = false;

  if (!meta) return { title, highlightLines, showLineNumbers };

  // Extract title="..."
  const titleMatch = meta.match(/title="([^"]*)"/);
  if (titleMatch) title = titleMatch[1];

  // Extract {3-5,8,12-14}
  const rangeMatch = meta.match(/\{([^}]+)\}/);
  if (rangeMatch?.[1]) {
    for (const part of rangeMatch[1].split(',')) {
      const trimmed = part.trim();
      const dashIdx = trimmed.indexOf('-');
      if (dashIdx !== -1) {
        const start = parseInt(trimmed.slice(0, dashIdx), 10);
        const end = parseInt(trimmed.slice(dashIdx + 1), 10);
        if (!Number.isNaN(start) && !Number.isNaN(end)) {
          for (let i = start; i <= end; i++) highlightLines.push(i);
        }
      } else {
        const num = parseInt(trimmed, 10);
        if (!Number.isNaN(num)) highlightLines.push(num);
      }
    }
  }

  // Check showLineNumbers
  if (meta.includes('showLineNumbers')) showLineNumbers = true;

  return { title, highlightLines, showLineNumbers };
}

/**
 * Rehype plugin to enhance code blocks with title, line numbers,
 * highlighting, copy button, and diff styling.
 *
 * Must run AFTER Shiki (operates on Shiki's HAST output).
 */
export function rehypeEnhancedCode() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'pre') return;

      // Find the <code> child
      const codeEl = node.children.find(
        (child): child is Element => child.type === 'element' && child.tagName === 'code',
      );
      if (!codeEl) return;

      // Get language from class (handle both HAST className array and Shiki class string)
      const classAttr = codeEl.properties?.className ?? codeEl.properties?.class;
      const classes = Array.isArray(classAttr)
        ? classAttr.map(String)
        : typeof classAttr === 'string'
          ? classAttr.split(/\s+/)
          : [];
      const langClass = classes.find((c) => c.startsWith('language-'));
      const lang = langClass?.slice(9);

      // Get meta string (Shiki preserves it on the code element)
      const meta = String(codeEl.properties?.['data-meta'] ?? codeEl.data?.meta ?? '');
      const { title, highlightLines, showLineNumbers } = parseMeta(meta);

      // Check if this is a diff block
      const isDiff = lang === 'diff';

      // Extract text lines from code element for diff processing
      const lines = extractTextLines(codeEl);

      // Add line-level attributes
      if (highlightLines.length > 0 || showLineNumbers || isDiff) {
        annotateLines(codeEl, { highlightLines, showLineNumbers, isDiff, lines });
      }

      // Build wrapper structure
      const wrapperChildren: Element[] = [];

      // Title bar
      if (title) {
        wrapperChildren.push({
          type: 'element',
          tagName: 'div',
          properties: {
            'data-code-title': true,
            style:
              'font-size:13px;font-family:monospace;padding:8px 16px;border-bottom:1px solid var(--docs-border,#e5e7eb);color:var(--docs-muted,#6b7280);background:var(--docs-primary-bg,#f8fafc)',
          },
          children: [{ type: 'text', value: title }],
        });
      }

      // Copy button
      const copyButton: Element = {
        type: 'element',
        tagName: 'button',
        properties: {
          'data-copy': true,
          style:
            'position:absolute;top:8px;right:8px;padding:4px 8px;font-size:12px;border:1px solid var(--docs-border,#e5e7eb);border-radius:4px;background:var(--docs-bg,#ffffff);color:var(--docs-muted,#6b7280);cursor:pointer;opacity:0;transition:opacity 0.2s',
          onclick:
            "navigator.clipboard.writeText(this.closest('[data-code-block]').querySelector('code').textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)",
        },
        children: [{ type: 'text', value: 'Copy' }],
      };

      // Wrap the <pre> in a container
      const container: Element = {
        type: 'element',
        tagName: 'div',
        properties: {
          'data-code-block': true,
          style:
            'position:relative;margin-bottom:16px;border:1px solid var(--docs-border,#e5e7eb);border-radius:8px;overflow:hidden',
          onmouseenter: "this.querySelector('[data-copy]').style.opacity='1'",
          onmouseleave: "this.querySelector('[data-copy]').style.opacity='0'",
        },
        children: [...wrapperChildren, node, copyButton],
      };

      // Replace <pre> with the wrapper in the parent
      if (parent && typeof index === 'number') {
        (parent as Element).children[index] = container;
      }
    });
  };
}

/** Extract text content of each line from a code element. */
function extractTextLines(codeEl: Element): string[] {
  let text = '';
  const walk = (node: Element | Text) => {
    if (node.type === 'text') {
      text += node.value;
    } else if ('children' in node) {
      for (const child of node.children) {
        if (child.type === 'text' || child.type === 'element') walk(child);
      }
    }
  };
  walk(codeEl);
  return text.split('\n');
}

/** Add data attributes to lines within a Shiki-rendered code element. */
function annotateLines(
  codeEl: Element,
  opts: {
    highlightLines: number[];
    showLineNumbers: boolean;
    isDiff: boolean;
    lines: string[];
  },
): void {
  // Shiki renders each line as a <span class="line"> child of <code>
  let lineIndex = 0;
  for (const child of codeEl.children) {
    if (child.type !== 'element') continue;
    // Shiki uses class="line" for each line span (handle both className array and class string)
    const cls = child.properties?.className ?? child.properties?.class;
    const clsList = Array.isArray(cls)
      ? cls.map(String)
      : typeof cls === 'string'
        ? cls.split(/\s+/)
        : [];
    const isLine = child.tagName === 'span' && clsList.includes('line');
    if (!isLine) continue;

    lineIndex++;

    // Highlight
    if (opts.highlightLines.includes(lineIndex)) {
      child.properties = child.properties ?? {};
      child.properties['data-highlighted'] = true;
      child.properties.style = `${child.properties.style ?? ''}background:rgba(37,99,235,0.1);`;
    }

    // Line numbers
    if (opts.showLineNumbers) {
      child.properties = child.properties ?? {};
      child.properties['data-line-number'] = lineIndex;
    }

    // Diff styling
    if (opts.isDiff) {
      const lineText = opts.lines[lineIndex - 1] ?? '';
      if (lineText.startsWith('+')) {
        child.properties = child.properties ?? {};
        child.properties['data-diff-add'] = true;
        child.properties.style = `${child.properties.style ?? ''}background:rgba(22,163,74,0.15);`;
      } else if (lineText.startsWith('-')) {
        child.properties = child.properties ?? {};
        child.properties['data-diff-remove'] = true;
        child.properties.style = `${child.properties.style ?? ''}background:rgba(220,38,38,0.15);`;
      }
    }
  }
}
