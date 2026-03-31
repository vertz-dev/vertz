import { RadioGroup } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { radioGroupItemProps, radioGroupProps } from '../props/radio-group-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <RadioGroup defaultValue="comfortable">
          <RadioGroup.Item value="default">Default</RadioGroup.Item>
          <RadioGroup.Item value="comfortable">Comfortable</RadioGroup.Item>
          <RadioGroup.Item value="compact">Compact</RadioGroup.Item>
        </RadioGroup>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { RadioGroup, Label } from 'vertz/components';

<RadioGroup defaultValue="comfortable">
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <RadioGroup.Item value="default" />
    <Label>Default</Label>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <RadioGroup.Item value="comfortable" />
    <Label>Comfortable</Label>
  </div>
</RadioGroup>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={radioGroupProps} />

      <DocH2>RadioGroup.Item Props</DocH2>
      <PropsTable props={radioGroupItemProps} />
    </>
  );
}
