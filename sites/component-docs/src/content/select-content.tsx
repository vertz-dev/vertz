import { Select } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { selectItemProps, selectProps } from '../props/select-props';

export const description =
  'Displays a list of options for the user to pick from, triggered by a button.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Select placeholder="Select a fruit" onValueChange={(v) => console.log(v)}>
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="apple">Apple</Select.Item>
            <Select.Item value="banana">Banana</Select.Item>
            <Select.Item value="cherry">Cherry</Select.Item>
          </Select.Content>
        </Select>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Select } from '@vertz/ui/components';

<Select placeholder="Choose..." onValueChange={(value) => console.log(value)}>
  <Select.Trigger />
  <Select.Content>
    <Select.Group label="Fruits">
      <Select.Item value="apple">Apple</Select.Item>
      <Select.Item value="banana">Banana</Select.Item>
    </Select.Group>
    <Select.Separator />
    <Select.Item value="other">Other</Select.Item>
  </Select.Content>
</Select>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={selectProps} />

      <DocH2>Select.Item Props</DocH2>
      <PropsTable props={selectItemProps} />
    </>
  );
}
