import { Skeleton } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { skeletonProps } from '../props/skeleton-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Skeleton width="250px" height="20px" />
          <Skeleton width="200px" height="20px" />
          <Skeleton width="150px" height="20px" />
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Skeleton } from 'vertz/components';

<Skeleton width="250px" height="20px" />
<Skeleton width="200px" height="20px" />`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={skeletonProps} />
    </>
  );
}
