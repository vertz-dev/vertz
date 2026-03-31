import { Toggle } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { toggleProps } from '../props/toggle-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Toggle>Bold</Toggle>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Toggle } from 'vertz/components';

<Toggle>Bold</Toggle>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={toggleProps} />
    </>
  );
}
