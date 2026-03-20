import { FormGroup, Input, Label } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { formErrorProps, formGroupProps } from '../props/form-group-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <FormGroup.FormGroup>
          <Label>Email</Label>
          <Input placeholder="you@example.com" />
          <FormGroup.FormError>Please enter a valid email address.</FormGroup.FormError>
        </FormGroup.FormGroup>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { FormGroup, Input, Label } from '@vertz/ui/components';

<FormGroup.FormGroup>
  <Label>Email</Label>
  <Input placeholder="you@example.com" />
  <FormGroup.FormError>Please enter a valid email.</FormGroup.FormError>
</FormGroup.FormGroup>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={formGroupProps} />

      <DocH2>FormError Props</DocH2>
      <PropsTable props={formErrorProps} />
    </>
  );
}
