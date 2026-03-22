import { Foreign } from '@vertz/ui';
import { highlightCode, isHighlighterReady, onHighlighterReady } from '../lib/highlighter';

type SupportedLang = 'tsx' | 'ts' | 'bash' | 'json';

export interface CodeBlockProps {
  code: string;
  lang?: SupportedLang;
  style?: Partial<CSSStyleDeclaration>;
}

export function CodeBlock({ code, lang = 'tsx', style }: CodeBlockProps) {
  let highlighted = '';
  let copied = false;

  // Highlight sync if ready, otherwise subscribe for when it loads.
  // Initialization is triggered by entry-client.ts AFTER hydration completes.
  if (isHighlighterReady()) {
    highlighted = highlightCode(code, lang) ?? '';
  } else {
    onHighlighterReady(() => {
      highlighted = highlightCode(code, lang) ?? '';
    });
  }

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

  const preStyle: Partial<CSSStyleDeclaration> = {
    margin: '0',
    padding: '16px 48px 16px 16px',
    fontSize: '13px',
    lineHeight: '1.5',
    overflow: 'auto',
    borderRadius: '8px',
    backgroundColor: 'var(--color-muted)' as string,
    fontFamily: 'var(--font-mono, monospace)' as string,
    color: 'var(--color-foreground)' as string,
  };

  return (
    <div style={containerStyle}>
      {highlighted ? (
        // @ts-expect-error Foreign returns Element (not JSX.Element) — known type gap in framework primitive
        <Foreign
          tag="div"
          className="code-block-highlighted"
          onReady={(container) => {
            (container as HTMLElement).innerHTML = highlighted;
            const pre = container.querySelector('pre');
            if (pre) {
              pre.setAttribute('tabindex', '0');
            }
          }}
        />
      ) : (
        <pre style={preStyle} tabindex={0}>
          <code>{code}</code>
        </pre>
      )}
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
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
