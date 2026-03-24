import type { TocHeading } from '../mdx/extract-headings';

export interface TableOfContentsProps {
  headings: TocHeading[];
}

function TocItem({ heading }: { heading: TocHeading }) {
  const indent = (heading.depth - 2) * 12;
  return (
    <a
      href={`#${heading.slug}`}
      data-toc-item
      data-depth={String(heading.depth)}
      style={{
        display: 'block',
        paddingLeft: `${indent}px`,
        paddingTop: '4px',
        paddingBottom: '4px',
        fontSize: '14px',
        textDecoration: 'none',
        color: 'var(--docs-muted, #6b7280)',
      }}
    >
      {heading.text}
    </a>
  );
}

export function TableOfContents({ headings }: TableOfContentsProps) {
  return (
    <nav aria-label="Table of contents">
      {headings.length > 0 && (
        <div
          style={{
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '8px',
            textTransform: 'uppercase',
          }}
        >
          On this page
        </div>
      )}
      {headings.map((heading) => (
        <TocItem heading={heading} />
      ))}
    </nav>
  );
}
