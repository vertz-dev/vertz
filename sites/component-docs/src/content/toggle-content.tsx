import { Toggle } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { toggleProps } from '../props/toggle-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Toggle>Bold</Toggle>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Toggle } from 'vertz/components';

<Toggle>Bold</Toggle>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={toggleProps} />
    </>
  );
}
