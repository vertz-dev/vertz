import { Textarea } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { textareaProps } from '../props/textarea-props';

export const description = 'Displays a multi-line text input field.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Textarea placeholder="Type your message here..." />
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Textarea } from '@vertz/ui/components';

<Textarea placeholder="Type your message..." />`}
        </code>
      </CodeFence>

      <DocH2>Examples</DocH2>

      <DocH3>With Rows</DocH3>
      <ComponentPreview>
        <Textarea placeholder="With 6 rows" rows={6} />
      </ComponentPreview>

      <DocH3>Disabled</DocH3>
      <ComponentPreview>
        <Textarea disabled placeholder="Disabled textarea" />
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={textareaProps} />
    </>
  );
}
