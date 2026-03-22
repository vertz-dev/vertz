import { Checkbox } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { checkboxProps } from '../props/checkbox-props';

export function Content() {
  return (
    <>
      <ComponentPreview>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: Checkbox is a custom form control */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--color-foreground)',
            fontSize: '14px',
          }}
        >
          <Checkbox />
          Accept terms and conditions
        </label>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Checkbox, Label } from 'vertz/components';

<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
  <Checkbox />
  <Label>Accept terms and conditions</Label>
</div>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={checkboxProps} />
    </>
  );
}
