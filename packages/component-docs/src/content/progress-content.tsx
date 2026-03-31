import { Progress } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
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
      <CodeBlock
        code={`import { Progress } from 'vertz/components';

<Progress defaultValue={60} />`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={progressProps} />
    </>
  );
}
