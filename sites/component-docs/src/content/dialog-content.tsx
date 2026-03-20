import { Button, Dialog } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { dialogContentProps, dialogProps } from '../props/dialog-props';

export const description = 'A window overlaid on the primary window, rendering content on top.';

export function Content() {
  return (
    <>
      <ComponentPreview>
        <Dialog>
          <Dialog.Trigger>
            <Button intent="outline">Open Dialog</Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Edit Profile</Dialog.Title>
              <Dialog.Description>Make changes to your profile here.</Dialog.Description>
            </Dialog.Header>
            <Dialog.Footer>
              <Dialog.Close>
                <Button intent="secondary">Cancel</Button>
              </Dialog.Close>
              <Button>Save changes</Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      </ComponentPreview>

      <DocH2>Installation</DocH2>
      <CodeFence>
        <code>bun add @vertz/ui @vertz/theme-shadcn</code>
      </CodeFence>

      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { Dialog, Button } from '@vertz/ui/components';

<Dialog>
  <Dialog.Trigger>
    <Button>Open</Button>
  </Dialog.Trigger>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
    </Dialog.Header>
    <Dialog.Footer>
      <Dialog.Close>Cancel</Dialog.Close>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog>`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={dialogProps} />

      <DocH2>Dialog.Content Props</DocH2>
      <PropsTable props={dialogContentProps} />
    </>
  );
}
