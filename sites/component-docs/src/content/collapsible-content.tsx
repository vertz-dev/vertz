import { Button, Collapsible } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
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
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Collapsible, Button } from 'vertz/components';

<Collapsible>
  <Collapsible.Trigger>
    <Button intent="ghost">Toggle</Button>
  </Collapsible.Trigger>
  <Collapsible.Content>
    Collapsible content here
  </Collapsible.Content>
</Collapsible>`}
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={collapsibleProps} />
    </>
  );
}
