import { Calendar } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { calendarProps } from '../props/calendar-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Calendar mode="single" />
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Calendar } from '@vertz/ui/components';

<Calendar mode="single" />`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={calendarProps} />
    </>
  );
}
