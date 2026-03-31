import { Pagination } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
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
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Pagination } from 'vertz/components';

let page = 1;

<Pagination
  currentPage={page}
  totalPages={10}
  onPageChange={(p) => { page = p; }}
/>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={paginationProps} />
    </>
  );
}
