import { Button, Collapsible } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { collapsibleProps } from '../props/collapsible-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Collapsible>
          <Collapsible.Trigger>
            <Button intent="ghost">Toggle content</Button>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <div
              style={{
                padding: '16px',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                marginTop: '8px',
              }}
            >
              This content can be collapsed and expanded.
            </div>
          </Collapsible.Content>
        </Collapsible>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Collapsible, Button } from '@vertz/ui/components';

<Collapsible>
  <Collapsible.Trigger>
    <Button intent="ghost">Toggle</Button>
  </Collapsible.Trigger>
  <Collapsible.Content>
    Collapsible content here
  </Collapsible.Content>
</Collapsible>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={collapsibleProps} />
    </>
  );
}
