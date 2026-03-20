import { Checkbox, Label } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { checkboxProps } from '../props/checkbox-props';

export const description =
  'A control that allows the user to toggle between checked and not checked.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Checkbox />
          <Label>Accept terms and conditions</Label>
        </div>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Checkbox, Label } from '@vertz/ui/components';

<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  <Checkbox />
  <Label>Accept terms and conditions</Label>
</div>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={checkboxProps} />
    </>
  );
}
