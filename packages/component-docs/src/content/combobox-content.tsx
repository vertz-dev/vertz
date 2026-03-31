import { ComposedCombobox } from '@vertz/ui-primitives';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { comboboxOptionProps, comboboxProps } from '../props/combobox-props';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <ComposedCombobox
          onValueChange={(v) => console.log('Selected:', v)}
          onInputChange={(v) => console.log('Input:', v)}
        >
          <ComposedCombobox.Input />
          <ComposedCombobox.Content>
            <ComposedCombobox.Option value="apple">Apple</ComposedCombobox.Option>
            <ComposedCombobox.Option value="banana">Banana</ComposedCombobox.Option>
            <ComposedCombobox.Option value="cherry">Cherry</ComposedCombobox.Option>
            <ComposedCombobox.Option value="grape">Grape</ComposedCombobox.Option>
            <ComposedCombobox.Option value="orange">Orange</ComposedCombobox.Option>
          </ComposedCombobox.Content>
        </ComposedCombobox>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { ComposedCombobox } from '@vertz/ui-primitives';

<ComposedCombobox
  onValueChange={(value) => console.log(value)}
  onInputChange={(input) => console.log(input)}
>
  <ComposedCombobox.Input />
  <ComposedCombobox.Content>
    <ComposedCombobox.Option value="apple">Apple</ComposedCombobox.Option>
    <ComposedCombobox.Option value="banana">Banana</ComposedCombobox.Option>
    <ComposedCombobox.Option value="cherry">Cherry</ComposedCombobox.Option>
  </ComposedCombobox.Content>
</ComposedCombobox>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={comboboxProps} />

      <DocH2>Combobox.Option Props</DocH2>
      <PropsTable props={comboboxOptionProps} />
    </>
  );
}
