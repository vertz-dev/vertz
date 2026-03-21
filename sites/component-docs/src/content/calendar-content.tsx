import { Calendar } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { calendarProps } from '../props/calendar-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Calendar mode="single" />
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Calendar } from 'vertz/components';

<Calendar mode="single" />`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={calendarProps} />
    </>
  );
}
