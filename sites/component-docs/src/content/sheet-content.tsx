import { Button, Sheet } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { sheetContentProps, sheetProps } from '../props/sheet-props';


export function Content() {
  return (
    <>
      <ComponentPreview>
        <Sheet>
          <Sheet.Trigger>
            <Button intent="outline">Open Sheet</Button>
          </Sheet.Trigger>
          <Sheet.Content>
            <Sheet.Title>Sheet Title</Sheet.Title>
            <Sheet.Description>Sheet description goes here.</Sheet.Description>
            <Sheet.Close>
              <Button intent="secondary">Close</Button>
            </Sheet.Close>
          </Sheet.Content>
        </Sheet>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Sheet, Button } from '@vertz/ui/components';

<Sheet>
  <Sheet.Trigger>
    <Button>Open Sheet</Button>
  </Sheet.Trigger>
  <Sheet.Content>
    <Sheet.Title>Title</Sheet.Title>
    <Sheet.Description>Description</Sheet.Description>
    <Sheet.Close>Close</Sheet.Close>
  </Sheet.Content>
</Sheet>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={sheetProps} />

      <DocH2>Sheet.Content Props</DocH2>
      <PropsTable props={sheetContentProps} />
    </>
  );
}
