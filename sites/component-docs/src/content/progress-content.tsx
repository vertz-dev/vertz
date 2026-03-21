import { Progress } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { progressProps } from '../props/progress-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ width: '300px' }}>
          <Progress defaultValue={60} />
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Progress } from 'vertz/components';

<Progress defaultValue={60} />`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={progressProps} />
    </>
  );
}
