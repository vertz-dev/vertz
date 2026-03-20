import { Pagination } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { PropsTable } from '../components/props-table';
import { paginationProps } from '../props/pagination-props';

export const description = 'Pagination with page navigation, previous and next links.';

export function Content() {
  let currentPage = 3;

  return (
    <>
      <ComponentPreview>
        <Pagination
          currentPage={currentPage}
          totalPages={10}
          onPageChange={(page) => {
            currentPage = page;
          }}
        />
      </ComponentPreview>

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
        Installation
      </h2>
      <pre
        style={{
          margin: '0 0 16px',
          padding: '16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </pre>

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
        Usage
      </h2>
      <pre
        style={{
          margin: '0 0 16px',
          padding: '16px',
          fontSize: '13px',
          lineHeight: '1.5',
          overflow: 'auto',
          borderRadius: '8px',
          backgroundColor: 'var(--color-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <code>
          {`import { Pagination } from '@vertz/ui/components';

let page = 1;

<Pagination
  currentPage={page}
  totalPages={10}
  onPageChange={(p) => { page = p; }}
/>`}
        </code>
      </pre>

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
        API Reference
      </h2>
      <PropsTable props={paginationProps} />
    </>
  );
}
