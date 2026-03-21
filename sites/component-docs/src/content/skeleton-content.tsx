import { Skeleton } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { skeletonCircleProps, skeletonProps, skeletonTextProps } from '../props/skeleton-props';
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

      <DocH2>Examples</DocH2>

      <DocH3>Text skeleton</DocH3>
      <ComponentPreview>
        <Skeleton.Text />
      </ComponentPreview>
      <CodeFence>
        <code>
          {`{/* 3 lines by default, last line shorter */}
<Skeleton.Text />

{/* Custom line count and width */}
<Skeleton.Text lines={5} lastLineWidth="50%" />`}
        </code>
      </CodeFence>

      <DocH3>Circle skeleton</DocH3>
      <ComponentPreview>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Skeleton.Circle />
          <Skeleton.Circle size="48px" />
          <Skeleton.Circle size="64px" />
        </div>
      </ComponentPreview>
      <CodeFence>
        <code>
          {`<Skeleton.Circle />
<Skeleton.Circle size="48px" />
<Skeleton.Circle size="64px" />`}
        </code>
      </CodeFence>

      <DocH3>Card skeleton</DocH3>
      <ComponentPreview>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '320px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <Skeleton.Circle size="40px" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1' }}>
              <Skeleton width="200px" height="16px" />
              <Skeleton width="150px" height="16px" />
            </div>
          </div>
          <Skeleton width="100%" height="120px" />
          <Skeleton.Text lines={2} />
        </div>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={skeletonProps} />

      <DocH2>Skeleton.Text Props</DocH2>
      <PropsTable props={skeletonTextProps} />

      <DocH2>Skeleton.Circle Props</DocH2>
      <PropsTable props={skeletonCircleProps} />
    </>
  );
}
