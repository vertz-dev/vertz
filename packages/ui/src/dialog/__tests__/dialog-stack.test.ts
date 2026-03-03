import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createContext, getContextScope, useContext } from '../../component/context';
import type { DialogHandle, DialogStack } from '../dialog-stack';
import {
  createDialogStack,
  DialogDismissedError,
  DialogStackContext,
  useDialogStack,
} from '../dialog-stack';

describe('DialogStack', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('opens a dialog and resolves with the close value', async () => {
    const stack = createDialogStack(container);

    function ConfirmDialog({
      message,
      dialog,
    }: {
      message: string;
      dialog: DialogHandle<boolean>;
    }) {
      const el = document.createElement('div');
      el.textContent = message;
      const btn = document.createElement('button');
      btn.textContent = 'OK';
      btn.addEventListener('click', () => dialog.close(true));
      el.appendChild(btn);
      return el;
    }

    const result = stack.open(ConfirmDialog, { message: 'Are you sure?' });

    expect(container.textContent).toContain('Are you sure?');

    container.querySelector('button')!.click();

    expect(await result).toBe(true);
  });

  it('tracks stack size', async () => {
    const stack = createDialogStack(container);

    function DialogA({ dialog }: { dialog: DialogHandle<void> }) {
      const el = document.createElement('div');
      const btn = document.createElement('button');
      btn.setAttribute('data-testid', 'close-a');
      btn.addEventListener('click', () => dialog.close());
      el.appendChild(btn);
      return el;
    }

    function DialogB({ dialog }: { dialog: DialogHandle<void> }) {
      const el = document.createElement('div');
      const btn = document.createElement('button');
      btn.setAttribute('data-testid', 'close-b');
      btn.addEventListener('click', () => dialog.close());
      el.appendChild(btn);
      return el;
    }

    expect(stack.size).toBe(0);

    const r1 = stack.open(DialogA, {});
    expect(stack.size).toBe(1);

    const r2 = stack.open(DialogB, {});
    expect(stack.size).toBe(2);

    container.querySelector('[data-testid="close-b"]')!.click();
    await r2;
    expect(stack.size).toBe(1);

    container.querySelector('[data-testid="close-a"]')!.click();
    await r1;
    expect(stack.size).toBe(0);
  });

  it('sets data-state attributes on wrapper elements', () => {
    const stack = createDialogStack(container);

    function DialogA({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    function DialogB({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    stack.open(DialogA, {});
    const wrapperA = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
    expect(wrapperA.getAttribute('data-state')).toBe('open');

    stack.open(DialogB, {});
    expect(wrapperA.getAttribute('data-state')).toBe('background');

    const wrapperB = container.querySelectorAll('[data-dialog-wrapper]')[1] as HTMLElement;
    expect(wrapperB.getAttribute('data-state')).toBe('open');
  });

  it('sets data-dialog-depth attributes', () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    stack.open(SimpleDialog, {});
    const wrapperA = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
    expect(wrapperA.getAttribute('data-dialog-depth')).toBe('0');

    stack.open(SimpleDialog, {});
    expect(wrapperA.getAttribute('data-dialog-depth')).toBe('1');

    const wrapperB = container.querySelectorAll('[data-dialog-wrapper]')[1] as HTMLElement;
    expect(wrapperB.getAttribute('data-dialog-depth')).toBe('0');
  });

  it('reveals previous dialog when top dialog closes', async () => {
    const stack = createDialogStack(container);

    function DialogA({ dialog }: { dialog: DialogHandle<string> }) {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'dialog-a');
      return el;
    }

    function DialogB({ dialog }: { dialog: DialogHandle<void> }) {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'dialog-b');
      const btn = document.createElement('button');
      btn.addEventListener('click', () => dialog.close());
      el.appendChild(btn);
      return el;
    }

    stack.open(DialogA, {});
    const wrapperA = container.querySelector('[data-dialog-wrapper]') as HTMLElement;

    const resultB = stack.open(DialogB, {});
    expect(wrapperA.getAttribute('data-state')).toBe('background');

    container.querySelector('[data-testid="dialog-b"] button')!.click();
    await resultB;

    expect(wrapperA.getAttribute('data-state')).toBe('open');
  });

  it('closeAll dismisses all dialogs with DialogDismissedError', async () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    const r1 = stack.open(SimpleDialog, {});
    const r2 = stack.open(SimpleDialog, {});
    expect(stack.size).toBe(2);

    stack.closeAll();

    await expect(r1).rejects.toBeInstanceOf(DialogDismissedError);
    await expect(r2).rejects.toBeInstanceOf(DialogDismissedError);
    expect(stack.size).toBe(0);
  });

  it('supports void result — close() with no arguments', async () => {
    const stack = createDialogStack(container);

    function InfoDialog({ dialog }: { dialog: DialogHandle<void> }) {
      const btn = document.createElement('button');
      btn.addEventListener('click', () => dialog.close());
      return btn;
    }

    const result = stack.open(InfoDialog, {});
    container.querySelector('button')!.click();

    expect(await result).toBeUndefined();
  });

  it('renders dialog within captured context scope', () => {
    const stack = createDialogStack(container);
    const ProjectContext = createContext<string>();
    let capturedProject: string | undefined;

    function ConfirmDialog({ dialog }: { dialog: DialogHandle<void> }) {
      capturedProject = useContext(ProjectContext);
      return document.createElement('div');
    }

    // Capture scope inside a Provider (simulates useDialogStack during component init)
    let scope: ReturnType<typeof getContextScope>;
    ProjectContext.Provider('my-project', () => {
      scope = getContextScope();
    });

    // Open with the captured scope — outside any Provider (simulates event handler)
    stack.openWithScope(ConfirmDialog, {}, scope!);

    expect(capturedProject).toBe('my-project');
  });

  it('removes wrapper from DOM after close', async () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
      const btn = document.createElement('button');
      btn.addEventListener('click', () => dialog.close());
      return btn;
    }

    const result = stack.open(SimpleDialog, {});
    expect(container.querySelectorAll('[data-dialog-wrapper]').length).toBe(1);

    container.querySelector('button')!.click();
    await result;

    expect(container.querySelectorAll('[data-dialog-wrapper]').length).toBe(0);
  });

  it('useDialogStack throws outside DialogStackContext', () => {
    expect(() => useDialogStack()).toThrow(
      'useDialogStack() must be called within DialogStackProvider',
    );
  });

  it('useDialogStack returns a working stack when inside context', async () => {
    const internalStack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
      const btn = document.createElement('button');
      btn.addEventListener('click', () => dialog.close(true));
      return btn;
    }

    let dialogs: DialogStack;
    DialogStackContext.Provider(internalStack, () => {
      dialogs = useDialogStack();
    });

    const result = dialogs!.open(SimpleDialog, {});
    container.querySelector('button')!.click();
    expect(await result).toBe(true);
  });

  it('dismisses topmost dialog on Escape key', async () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    const result = stack.open(SimpleDialog, {});

    const wrapper = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
    wrapper.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await expect(result).rejects.toBeInstanceOf(DialogDismissedError);
    expect(stack.size).toBe(0);
  });

  it('sets data-state="closed" immediately on close for exit animation', () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
      const btn = document.createElement('button');
      btn.addEventListener('click', () => dialog.close(true));
      return btn;
    }

    stack.open(SimpleDialog, {});
    const wrapper = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
    expect(wrapper.getAttribute('data-state')).toBe('open');

    // Click close — data-state changes immediately for CSS animation
    container.querySelector('button')!.click();
    expect(wrapper.getAttribute('data-state')).toBe('closed');
  });

  it('does not close on Escape when not the topmost dialog', async () => {
    const stack = createDialogStack(container);

    function DialogA({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    function DialogB({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    stack.open(DialogA, {});
    stack.open(DialogB, {});

    // Dispatch Escape on dialog A's wrapper — should not dismiss A
    const wrapperA = container.querySelector('[data-dialog-wrapper]') as HTMLElement;
    wrapperA.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // B should still be on top, stack size unchanged
    // (In practice the focus trap prevents this, but the handler
    // should only dismiss if the entry is the topmost)
    expect(stack.size).toBe(2);
  });

  it('useDialogStack captures context scope eagerly for use in event handlers', () => {
    const internalStack = createDialogStack(container);
    const ProjectContext = createContext<string>();
    let capturedProject: string | undefined;

    function MyDialog({ dialog }: { dialog: DialogHandle<void> }) {
      capturedProject = useContext(ProjectContext);
      return document.createElement('div');
    }

    let dialogs: DialogStack;
    DialogStackContext.Provider(internalStack, () => {
      ProjectContext.Provider('my-project', () => {
        dialogs = useDialogStack();
      });
    });

    // Called outside any Provider (simulates onClick handler)
    dialogs!.open(MyDialog, {});

    expect(capturedProject).toBe('my-project');
  });
});
