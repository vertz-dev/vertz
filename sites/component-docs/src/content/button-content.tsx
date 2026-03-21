import { Button } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { buttonProps } from '../props/button-props';
export function Content() {
  return (
    <>
      <ComponentPreview>
        <Button intent="primary" size="md">
          Click me
        </Button>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Button } from 'vertz/components';

<Button intent="primary">Click me</Button>`}
        </code>
      </CodeFence>

      <DocH2>Examples</DocH2>

      <DocH3>Secondary</DocH3>
      <ComponentPreview>
        <Button intent="secondary">Secondary</Button>
      </ComponentPreview>

      <DocH3>Destructive</DocH3>
      <ComponentPreview>
        <Button intent="destructive">Destructive</Button>
      </ComponentPreview>

      <DocH3>Outline</DocH3>
      <ComponentPreview>
        <Button intent="outline">Outline</Button>
      </ComponentPreview>

      <DocH3>Ghost</DocH3>
      <ComponentPreview>
        <Button intent="ghost">Ghost</Button>
      </ComponentPreview>

      <DocH3>Link</DocH3>
      <ComponentPreview>
        <Button intent="link">Link</Button>
      </ComponentPreview>

      <DocH3>Sizes</DocH3>
      <ComponentPreview>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </ComponentPreview>

      <DocH3>Disabled</DocH3>
      <ComponentPreview>
        <Button disabled>Disabled</Button>
      </ComponentPreview>

      <DocH2>API Reference</DocH2>
      <PropsTable props={buttonProps} />
    </>
  );
}
