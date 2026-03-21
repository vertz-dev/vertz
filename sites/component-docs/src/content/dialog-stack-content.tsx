import { CodeFence, DocH2, DocH3 } from '../components/mdx-components';
import { PropsTable } from '../components/props-table';
import {
  dialogHandleProps,
  dialogStackProviderProps,
  useDialogStackReturnProps,
} from '../props/dialog-stack-props';

export function Content() {
  return (
    <>
      <DocH2>Overview</DocH2>
      <p
        style={{
          fontSize: '14px',
          lineHeight: '1.7',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 24px',
        }}
      >
        The Dialog Stack is the single pattern for all dialogs in Vertz. It provides an imperative,
        promise-based API with automatic overlay, focus trapping, and stacking via native{' '}
        {'<dialog>'}. Use it for confirmations, form submissions, multi-step flows, or any modal
        interaction.
      </p>

      <DocH2>Usage</DocH2>
      <DocH3>1. Wrap your app with DialogStackProvider</DocH3>
      <CodeFence>
        <code>
          {`import { DialogStackProvider } from '@vertz/ui';

export function App() {
  return (
    <DialogStackProvider>
      <MyApp />
    </DialogStackProvider>
  );
}`}
        </code>
      </CodeFence>

      <DocH3>2. Create a dialog component</DocH3>
      <p
        style={{
          fontSize: '14px',
          lineHeight: '1.7',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 16px',
        }}
      >
        Dialog components receive a <code>dialog</code> prop with a <code>close()</code> method. The
        value passed to <code>close()</code> becomes the result returned to the caller.
      </p>
      <CodeFence>
        <code>
          {`import type { DialogHandle } from '@vertz/ui';
import { Dialog, Button } from '@vertz/ui/components';

interface ConfirmDialogProps {
  message: string;
  dialog: DialogHandle<boolean>;
}

function ConfirmDialog({ message, dialog }: ConfirmDialogProps) {
  return (
    <>
      <Dialog.Header>
        <Dialog.Title>Confirm</Dialog.Title>
        <Dialog.Description>{message}</Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Dialog.Cancel>Cancel</Dialog.Cancel>
        <Button intent="danger" onClick={() => dialog.close(true)}>
          Confirm
        </Button>
      </Dialog.Footer>
    </>
  );
}`}
        </code>
      </CodeFence>

      <DocH3>3. Open dialogs with useDialogStack()</DocH3>
      <CodeFence>
        <code>
          {`import { useDialogStack } from '@vertz/ui';

function DeleteButton({ itemId }: { itemId: string }) {
  const dialogs = useDialogStack();

  async function handleClick() {
    const result = await dialogs.open(ConfirmDialog, {
      message: 'Are you sure you want to delete this item?',
    });

    if (result.ok && result.data) {
      await deleteItem(itemId);
    }
  }

  return <Button intent="danger" onClick={handleClick}>Delete</Button>;
}`}
        </code>
      </CodeFence>

      <DocH2>Key Concepts</DocH2>

      <DocH3>Promise-based results</DocH3>
      <p
        style={{
          fontSize: '14px',
          lineHeight: '1.7',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 16px',
        }}
      >
        <code>open()</code> returns a <code>Promise{'<DialogResult<T>>'}</code>. When the dialog
        calls <code>dialog.close(value)</code>, the promise resolves with{' '}
        <code>{'{ ok: true, data: value }'}</code>. If the dialog is dismissed (Escape key or{' '}
        <code>closeAll()</code>), it resolves with <code>{'{ ok: false }'}</code>.
      </p>

      <DocH3>Context preservation</DocH3>
      <p
        style={{
          fontSize: '14px',
          lineHeight: '1.7',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 16px',
        }}
      >
        <code>useDialogStack()</code> captures the context scope at the call site. Dialogs opened
        later (e.g., from event handlers) can access all Providers from where{' '}
        <code>useDialogStack()</code> was called — not just at the{' '}
        <code>{'<DialogStackProvider>'}</code> level.
      </p>

      <DocH3>Stacked dialogs</DocH3>
      <p
        style={{
          fontSize: '14px',
          lineHeight: '1.7',
          color: 'var(--color-muted-foreground)',
          margin: '0 0 16px',
        }}
      >
        Multiple dialogs can be open simultaneously. Each new dialog gets{' '}
        <code>data-state="open"</code> while previous ones get <code>data-state="background"</code>.
        The Escape key only dismisses the topmost dialog.
      </p>

      <DocH2>API Reference</DocH2>

      <DocH3>DialogStackProvider Props</DocH3>
      <PropsTable props={dialogStackProviderProps} />

      <DocH3>useDialogStack() Return Value</DocH3>
      <PropsTable props={useDialogStackReturnProps} />

      <DocH3>DialogHandle{'<TResult>'}</DocH3>
      <PropsTable props={dialogHandleProps} />
    </>
  );
}
