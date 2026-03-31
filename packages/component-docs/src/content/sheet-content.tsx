import { Button, Input, Label, Sheet } from '@vertz/ui/components';
import { CodeBlock } from '../components/code-block';
import { ComponentPreview } from '../components/component-preview';
import { DocH2 } from '../components/mdx-components';
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
            <Sheet.Title>Edit profile</Sheet.Title>
            <Sheet.Description>Make changes to your profile here.</Sheet.Description>
            <div style={{ display: 'grid', gap: '1rem', padding: '1rem 0' }}>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Label for="sheet-name">Name</Label>
                <Input id="sheet-name" name="name" defaultValue="Pedro Duarte" />
              </div>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                <Label for="sheet-username">Username</Label>
                <Input id="sheet-username" name="username" defaultValue="@peduarte" />
              </div>
            </div>
            <Button intent="primary" size="md">
              Save changes
            </Button>
          </Sheet.Content>
        </Sheet>
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeBlock
        code={`import { Sheet, Button } from 'vertz/components';

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
        lang="tsx"
      />

      <DocH2>API Reference</DocH2>
      <PropsTable props={sheetProps} />

      <DocH2>Sheet.Content Props</DocH2>
      <PropsTable props={sheetContentProps} />
    </>
  );
}
