/** MDX component overrides for consistent styling of markdown elements. */

interface MdxProps {
  children?: unknown;
  [key: string]: unknown;
}

export function DocH1({ children }: MdxProps) {
  return (
    <h1
      style={{
        fontSize: '30px',
        fontWeight: '700',
        lineHeight: '1.2',
        color: 'var(--color-foreground)',
        margin: '0 0 8px',
      }}
    >
      {children}
    </h1>
  );
}

export function DocH2({ children }: MdxProps) {
  return (
    <h2
      style={{
        fontSize: '22px',
        fontWeight: '600',
        lineHeight: '1.3',
        color: 'var(--color-foreground)',
        margin: '32px 0 16px',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      {children}
    </h2>
  );
}

export function DocH3({ children }: MdxProps) {
  return (
    <h3
      style={{
        fontSize: '18px',
        fontWeight: '600',
        lineHeight: '1.4',
        color: 'var(--color-foreground)',
        margin: '24px 0 12px',
      }}
    >
      {children}
    </h3>
  );
}

export function DocParagraph({ children }: MdxProps) {
  return (
    <p
      style={{
        fontSize: '15px',
        lineHeight: '1.7',
        color: 'var(--color-foreground)',
        margin: '0 0 16px',
      }}
    >
      {children}
    </p>
  );
}

export function InlineCode({ children }: MdxProps) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: '13px',
        backgroundColor: 'var(--color-muted)',
        padding: '2px 6px',
        borderRadius: '4px',
      }}
    >
      {children}
    </code>
  );
}

export function DocLink({ href, children }: MdxProps & { href?: string }) {
  return (
    <a
      href={href ?? undefined}
      style={{
        color: 'var(--color-primary)',
        textDecoration: 'underline',
        textUnderlineOffset: '4px',
      }}
    >
      {children}
    </a>
  );
}

export function DocList({ children }: MdxProps) {
  return (
    <ul
      style={{
        paddingLeft: '24px',
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.7',
      }}
    >
      {children}
    </ul>
  );
}

export function DocOrderedList({ children }: MdxProps) {
  return (
    <ol
      style={{
        paddingLeft: '24px',
        margin: '0 0 16px',
        fontSize: '15px',
        lineHeight: '1.7',
      }}
    >
      {children}
    </ol>
  );
}

export function DocTable({ children }: MdxProps) {
  return (
    <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        {children}
      </table>
    </div>
  );
}

/**
 * CodeFence: styled code block with copy-to-clipboard button.
 */
export function CodeFence({ children, ...props }: MdxProps) {
  let copied = false;

  function handleCopy(e: MouseEvent) {
    const btn = e.currentTarget as HTMLElement;
    const pre = btn.parentElement?.querySelector('pre');
    const text = pre?.textContent ?? '';
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => {
        copied = false;
      }, 2000);
    }
  }

  return (
    <div style={{ position: 'relative', marginBottom: '16px' }}>
      <pre
        {...props}
        style={{
          margin: '0',
          padding: '16px 48px 16px 16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--color-foreground)',
          ...(typeof props.style === 'object' ? props.style : {}),
        }}
      >
        {children}
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy code"
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

/** Map of all MDX component overrides. */
export const mdxComponents = {
  h1: DocH1,
  h2: DocH2,
  h3: DocH3,
  p: DocParagraph,
  code: InlineCode,
  pre: CodeFence,
  a: DocLink,
  ul: DocList,
  ol: DocOrderedList,
  table: DocTable,
};
