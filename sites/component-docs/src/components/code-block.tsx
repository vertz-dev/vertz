import { Foreign } from '@vertz/ui';
import { highlightCode, isHighlighterReady, onHighlighterReady } from '../lib/highlighter';

type SupportedLang = 'tsx' | 'ts' | 'bash' | 'json';

export interface CodeBlockProps {
  code: string;
  lang?: SupportedLang;
  style?: Partial<CSSStyleDeclaration>;
}

/** Escape HTML special characters for safe text rendering. */
function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build a plain `<pre><code>` fallback HTML string.
 * Used when Shiki is not available — both SSR and client render
 * the same structure inside the Foreign container.
 */
function buildFallbackHtml(code: string): string {
  return `<pre tabindex="0"><code>${escapeForHtml(code)}</code></pre>`;
}

export function CodeBlock({ code, lang = 'tsx', style }: CodeBlockProps) {
  let copied = false;

  // Get highlighted HTML synchronously if Shiki is ready (true during SSR).
  // Falls back to a plain <pre><code> so SSR and client always render a
  // Foreign container — avoiding hydration mismatches from conditional swaps.
  const initialHtml = isHighlighterReady()
    ? (highlightCode(code, lang) ?? buildFallbackHtml(code))
    : buildFallbackHtml(code);

  function handleCopy() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  }

  const containerStyle: Partial<CSSStyleDeclaration> = {
    position: 'relative',
    marginBottom: '16px',
    ...style,
  };

  return (
    <div style={containerStyle}>
      {/* @ts-expect-error Foreign returns Element (not JSX.Element) — known type gap in framework primitive */}
      <Foreign
        tag="div"
        className="code-block-highlighted"
        html={initialHtml}
        onReady={(container) => {
          const el = container as HTMLElement;
          const applyHighlighting = (html: string) => {
            el.innerHTML = html;
            const pre = el.querySelector('pre');
            if (pre) pre.setAttribute('tabindex', '0');
          };

          if (isHighlighterReady()) {
            // Shiki already loaded (e.g. subsequent client navigation)
            applyHighlighting(highlightCode(code, lang) ?? buildFallbackHtml(code));
          } else {
            // SSR content is already in the DOM from hydration — leave it.
            // When Shiki loads on the client, upgrade to highlighted code.
            onHighlighterReady(() => {
              applyHighlighting(highlightCode(code, lang) ?? buildFallbackHtml(code));
            });
          }
        }}
      />
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          backgroundColor: 'var(--color-background)',
          color: 'var(--color-muted-foreground)',
          cursor: 'pointer',
          opacity: '0.6',
          transition: 'opacity 0.15s',
        }}
      >
        {copied ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
