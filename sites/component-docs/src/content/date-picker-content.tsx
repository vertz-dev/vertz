import { DatePicker } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { datePickerProps } from '../props/date-picker-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <DatePicker placeholder="Pick a date">
          <DatePicker.Trigger />
          <DatePicker.Content />
        </DatePicker>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { DatePicker } from '@vertz/ui/components';

<DatePicker placeholder="Pick a date">
  <DatePicker.Trigger />
  <DatePicker.Content />
</DatePicker>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={datePickerProps} />
    </>
  );
}
