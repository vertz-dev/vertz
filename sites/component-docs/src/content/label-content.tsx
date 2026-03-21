import { Input, Label } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { labelProps } from '../props/label-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Label for="demo-input">Email</Label>
          <Input id="demo-input" type="email" placeholder="you@example.com" />
        </div>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Label } from 'vertz/components';

<Label for="email">Email</Label>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={labelProps} />
    </>
  );
}
