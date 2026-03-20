import { Pagination } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { paginationProps } from '../props/pagination-props';


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

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Pagination } from '@vertz/ui/components';

let page = 1;

<Pagination
  currentPage={page}
  totalPages={10}
  onPageChange={(p) => { page = p; }}
/>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={paginationProps} />
    </>
  );
}
