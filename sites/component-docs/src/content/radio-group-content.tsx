import { Label, RadioGroup } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { radioGroupItemProps, radioGroupProps } from '../props/radio-group-props';

export const description = 'A set of checkable buttons where only one can be checked at a time.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <RadioGroup defaultValue="comfortable">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RadioGroup.Item value="default" />
            <Label>Default</Label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RadioGroup.Item value="comfortable" />
            <Label>Comfortable</Label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <RadioGroup.Item value="compact" />
            <Label>Compact</Label>
          </div>
        </RadioGroup>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { RadioGroup, Label } from '@vertz/ui/components';

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
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={radioGroupProps} />

      <DocH2>RadioGroup.Item Props</DocH2>
      <PropsTable props={radioGroupItemProps} />
    </>
  );
}
