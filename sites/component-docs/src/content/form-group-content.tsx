import { FormGroup, Input, Label } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { formErrorProps, formGroupProps } from '../props/form-group-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <FormGroup>
          <Label>Email</Label>
          <Input placeholder="you@example.com" />
          <FormGroup.FormError>Please enter a valid email address.</FormGroup.FormError>
        </FormGroup>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { FormGroup, Input, Label } from 'vertz/components';

<FormGroup>
  <Label>Email</Label>
  <Input placeholder="you@example.com" />
  <FormGroup.FormError>Please enter a valid email.</FormGroup.FormError>
</FormGroup>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={formGroupProps} />

      <DocH2>FormError Props</DocH2>
      <PropsTable props={formErrorProps} />
    </>
  );
}
