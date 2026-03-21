import { useDialogStack } from '@vertz/ui';
import { Button } from '@vertz/ui/components';
import { ComponentPreview } from '../components/component-preview';
import { CodeFence, DocH2 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import { confirmProps } from '../props/alert-dialog-props';

function ConfirmExample() {
  const dialogs = useDialogStack();

  async function handleDelete() {
    const confirmed = await dialogs.confirm({
      title: 'Are you absolutely sure?',
      description:
        'This action cannot be undone. This will permanently delete your account and remove your data from our servers.',
      confirm: 'Continue',
      cancel: 'Cancel',
      intent: 'danger',
    });
    if (confirmed) {
      // handle delete
    }
  }

  return (
    <Button intent="destructive" onClick={handleDelete}>
      Delete Account
    </Button>
  );
}

export function Content() {
  return (
    <>
      <ComponentPreview>
        <ConfirmExample />
      </ComponentPreview>
      <DocH2>Usage</DocH2>
      <CodeFence>
        <code>
          {`import { useDialogStack } from '@vertz/ui';
import { Button } from '@vertz/ui/components';

function DeleteButton() {
  const dialogs = useDialogStack();

  async function handleDelete() {
    const confirmed = await dialogs.confirm({
      title: 'Are you sure?',
      description: 'This cannot be undone.',
      confirm: 'Delete',
      cancel: 'Cancel',
      intent: 'danger',
    });
    if (confirmed) {
      // perform delete
    }
  }

  return <Button intent="destructive" onClick={handleDelete}>Delete</Button>;
}`}
        </code>
      </CodeFence>

      <DocH2>API Reference</DocH2>
      <PropsTable props={confirmProps} />
    </>
  );
}
