import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { createContext, getContextScope, useContext } from '../../component/context';
import { resetInjectedStyles } from '../../css/css';
import { ThemeProvider } from '../../css/theme-provider';
import {
  __append,
  __element,
  __enterChildren,
  __exitChildren,
  __staticText,
} from '../../dom/element';
import { __on } from '../../dom/events';
import { form, type SdkMethod } from '../../form/form';
import { endHydration, startHydration } from '../../hydrate/hydration-context';
import { mount } from '../../mount';
import type { DialogHandle, DialogStack } from '../dialog-stack';
import {
  createDialogStack,
  DialogIdContext,
  DialogStackContext,
  DialogStackProvider,
  useDialog,
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

  it('opens a dialog and resolves with { ok: true, data: value }', async () => {
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

    const promise = stack.open(ConfirmDialog, { message: 'Are you sure?' });

    expect(container.textContent).toContain('Are you sure?');

    container.querySelector('button')!.click();

    const result = await promise;
    expect(result).toEqual({ ok: true, data: true });
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
    const result2 = await r2;
    expect(result2.ok).toBe(true);
    expect(stack.size).toBe(1);

    container.querySelector('[data-testid="close-a"]')!.click();
    const result1 = await r1;
    expect(result1.ok).toBe(true);
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

  it('closeAll resolves all dialogs with { ok: false }', async () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    const r1 = stack.open(SimpleDialog, {});
    const r2 = stack.open(SimpleDialog, {});
    expect(stack.size).toBe(2);

    stack.closeAll();

    expect(await r1).toEqual({ ok: false });
    expect(await r2).toEqual({ ok: false });
    expect(stack.size).toBe(0);
  });

  it('supports void result — close() resolves with { ok: true, data: undefined }', async () => {
    const stack = createDialogStack(container);

    function InfoDialog({ dialog }: { dialog: DialogHandle<void> }) {
      const btn = document.createElement('button');
      btn.addEventListener('click', () => dialog.close());
      return btn;
    }

    const promise = stack.open(InfoDialog, {});
    container.querySelector('button')!.click();

    const result = await promise;
    expect(result).toEqual({ ok: true, data: undefined });
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

    const promise = stack.open(SimpleDialog, {});
    expect(container.querySelectorAll('[data-dialog-wrapper]').length).toBe(1);

    container.querySelector('button')!.click();
    await promise;

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

    const promise = dialogs!.open(SimpleDialog, {});
    container.querySelector('button')!.click();
    const result = await promise;
    expect(result).toEqual({ ok: true, data: true });
  });

  it('dismisses topmost dialog on Escape key with { ok: false }', async () => {
    const stack = createDialogStack(container);

    function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
      return document.createElement('div');
    }

    const promise = stack.open(SimpleDialog, {});

    // Dispatch cancel event on the <dialog> element (native Escape triggers this)
    const dialogEl = container.querySelector('dialog') as HTMLDialogElement;
    dialogEl.dispatchEvent(new Event('cancel', { bubbles: false }));

    const result = await promise;
    expect(result).toEqual({ ok: false });
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

    // Dispatch cancel on dialog A — should not dismiss A (B is topmost)
    const dialogA = container.querySelector('dialog') as HTMLDialogElement;
    dialogA.dispatchEvent(new Event('cancel', { bubbles: false }));

    // B should still be on top, stack size unchanged
    expect(stack.size).toBe(2);
  });

  it('ignores Escape after dialog.close() has been called (no double resolution)', async () => {
    const stack = createDialogStack(container);
    let closeHandle: (() => void) | undefined;

    function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
      closeHandle = () => dialog.close(true);
      return document.createElement('div');
    }

    const promise = stack.open(SimpleDialog, {});
    const dialogEl = container.querySelector('dialog') as HTMLDialogElement;

    // Close via dialog.close()
    closeHandle!();

    // Then try to dismiss via cancel — should be ignored (settled flag prevents it)
    dialogEl.dispatchEvent(new Event('cancel', { bubbles: false }));

    const result = await promise;
    expect(result).toEqual({ ok: true, data: true });
  });

  it('ignores dialog.close() after closeAll() has already dismissed', async () => {
    const stack = createDialogStack(container);
    let closeHandle: (() => void) | undefined;

    function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
      closeHandle = () => dialog.close(true);
      return document.createElement('div');
    }

    const promise = stack.open(SimpleDialog, {});

    // Dismiss via closeAll
    stack.closeAll();

    // Then try to close explicitly — should be ignored
    closeHandle!();

    const result = await promise;
    expect(result).toEqual({ ok: false });
  });

  it('form onSubmit handler fires inside dynamically-opened dialog', () => {
    const stack = createDialogStack(container);
    let preventDefaultCalled = false;

    function FormDialog({ dialog }: { dialog: DialogHandle<void> }) {
      const formEl = document.createElement('form');
      __on(formEl, 'submit', (e: Event) => {
        e.preventDefault();
        preventDefaultCalled = true;
      });
      return formEl;
    }

    stack.open(FormDialog, {});

    const formEl = container.querySelector('form')!;
    expect(formEl).toBeTruthy();
    formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(preventDefaultCalled).toBe(true);
  });

  it('form() onSubmit handler prevents default inside dialog (compiled path)', () => {
    const stack = createDialogStack(container);
    let preventDefaultCalled = false;

    const mockSdkMethod = Object.assign(
      (_body: unknown) => Promise.resolve({ ok: true, data: { id: '1' } }),
      { url: '/api/test', method: 'POST' },
    ) as unknown as SdkMethod<{ title: string }, { id: string }>;

    function FormDialog({ dialog }: { dialog: DialogHandle<void> }) {
      const taskForm = form(mockSdkMethod);

      // Simulate compiled output: __element + __on + __bindElement
      const formEl = __element('form') as HTMLFormElement;
      {
        const __v = taskForm.action;
        if (__v != null && __v !== false)
          formEl.setAttribute('action', __v === true ? '' : (__v as string));
      }
      {
        const __v = taskForm.method;
        if (__v != null && __v !== false)
          formEl.setAttribute('method', __v === true ? '' : (__v as string));
      }
      __on(formEl, 'submit', taskForm.onSubmit);
      taskForm.__bindElement(formEl);

      const inputEl = __element('input') as HTMLInputElement;
      inputEl.setAttribute('name', 'title');
      formEl.appendChild(inputEl);

      return formEl;
    }

    stack.open(FormDialog, {});

    const formEl = container.querySelector('form')! as HTMLFormElement;
    expect(formEl).toBeTruthy();
    expect(formEl.getAttribute('action')).toBe('/api/test');
    expect(formEl.getAttribute('method')).toBe('POST');

    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const originalPreventDefault = submitEvent.preventDefault.bind(submitEvent);
    submitEvent.preventDefault = () => {
      preventDefaultCalled = true;
      originalPreventDefault();
    };
    formEl.dispatchEvent(submitEvent);

    expect(preventDefaultCalled).toBe(true);
  });

  it('event listeners are cleaned up when dialog closes', async () => {
    const stack = createDialogStack(container);
    let clickCount = 0;

    function ClickDialog({ dialog }: { dialog: DialogHandle<void> }) {
      const btn = document.createElement('button');
      __on(btn, 'click', () => {
        clickCount++;
      });
      const closeBtn = document.createElement('button');
      closeBtn.setAttribute('data-testid', 'close');
      closeBtn.addEventListener('click', () => dialog.close());
      const wrapper = document.createElement('div');
      wrapper.appendChild(btn);
      wrapper.appendChild(closeBtn);
      return wrapper;
    }

    const promise = stack.open(ClickDialog, {});
    const btn = container.querySelector('button')!;
    btn.click();
    expect(clickCount).toBe(1);

    // Close the dialog — cleanups should run
    container.querySelector('[data-testid="close"]')!.click();
    await promise;

    // After close, the listener should have been removed via disposal scope cleanup
    btn.click();
    expect(clickCount).toBe(1);
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

  describe('Native <dialog> wrapper', () => {
    it('wraps content in a native <dialog> element', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'content');
        return el;
      }

      stack.open(SimpleDialog, {});

      const dialogEl = container.querySelector('dialog');
      expect(dialogEl).toBeTruthy();
      expect(dialogEl!.querySelector('[data-testid="content"]')).toBeTruthy();
    });

    it('renders a panel div with role="dialog" and aria-modal="true" inside the <dialog>', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {});

      const panel = container.querySelector('[data-part="panel"]') as HTMLElement;
      expect(panel).toBeTruthy();
      expect(panel.getAttribute('role')).toBe('dialog');
      expect(panel.getAttribute('aria-modal')).toBe('true');
    });

    it('sets aria-labelledby and aria-describedby with dialog ID on the panel', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {});

      const panel = container.querySelector('[data-part="panel"]') as HTMLElement;
      const labelledBy = panel.getAttribute('aria-labelledby');
      const describedBy = panel.getAttribute('aria-describedby');

      expect(labelledBy).toMatch(/^dlg-\d+-title$/);
      expect(describedBy).toMatch(/^dlg-\d+-desc$/);
    });

    it('dismisses the dialog when clicking on the dialog backdrop', async () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      const promise = stack.open(SimpleDialog, {});

      const dialogEl = container.querySelector('dialog') as HTMLDialogElement;
      const panel = dialogEl.querySelector('[data-part="panel"]') as HTMLElement;

      // Simulate click outside the panel (on the backdrop)
      // Use coordinates that fall outside the panel's bounding rect
      const panelRect = panel.getBoundingClientRect();
      dialogEl.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: panelRect.left - 10,
          clientY: panelRect.top - 10,
        }),
      );

      const result = await promise;
      expect(result).toEqual({ ok: false });
    });

    it('does not dismiss when clicking inside the panel', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {});

      const panel = container.querySelector('[data-part="panel"]') as HTMLElement;

      // Click on the panel itself — should NOT dismiss
      panel.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(stack.size).toBe(1);
    });

    it('does not dismiss on backdrop click when dismissible is false', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {}, { dismissible: false });

      const dialogEl = container.querySelector('dialog') as HTMLDialogElement;
      const panel = dialogEl.querySelector('[data-part="panel"]') as HTMLElement;
      const panelRect = panel.getBoundingClientRect();

      dialogEl.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          clientX: panelRect.left - 10,
          clientY: panelRect.top - 10,
        }),
      );

      expect(stack.size).toBe(1);
    });

    it('does not dismiss on Escape when dismissible is false', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {}, { dismissible: false });

      const dialogEl = container.querySelector('dialog') as HTMLDialogElement;
      dialogEl.dispatchEvent(new Event('cancel', { bubbles: false }));

      expect(stack.size).toBe(1);
    });

    it('still allows explicit dialog.close() when dismissible is false', async () => {
      const stack = createDialogStack(container);
      let closeHandle: (() => void) | undefined;

      function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
        closeHandle = () => dialog.close(true);
        return document.createElement('div');
      }

      const promise = stack.open(SimpleDialog, {}, { dismissible: false });
      closeHandle!();

      const result = await promise;
      expect(result).toEqual({ ok: true, data: true });
    });

    it('provides DialogHandle via context — useDialog() returns the handle', async () => {
      const stack = createDialogStack(container);
      let hookHandle: DialogHandle<boolean> | undefined;

      function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
        hookHandle = useDialog<boolean>();
        return document.createElement('div');
      }

      const promise = stack.open(SimpleDialog, {});

      expect(hookHandle).toBeDefined();
      // The hook should return the same close behavior as the prop
      hookHandle!.close(true);

      const result = await promise;
      expect(result).toEqual({ ok: true, data: true });
    });

    it('useDialog() throws when called outside a dialog', () => {
      expect(() => useDialog()).toThrow(
        'useDialog() must be called within a dialog opened via DialogStack',
      );
    });

    it('provides dialog ID via context for ARIA integration', () => {
      const stack = createDialogStack(container);
      let dialogId: string | undefined;

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        dialogId = useContext(DialogIdContext);
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {});

      expect(dialogId).toBeDefined();
      expect(dialogId).toMatch(/^dlg-\d+$/);
    });

    it('auto-assigns ARIA IDs to title and description elements', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        const frag = document.createDocumentFragment();
        const title = document.createElement('h2');
        title.setAttribute('data-part', 'title');
        title.textContent = 'Test Title';
        frag.appendChild(title);
        const desc = document.createElement('p');
        desc.setAttribute('data-part', 'description');
        desc.textContent = 'Test Description';
        frag.appendChild(desc);
        return frag;
      }

      stack.open(SimpleDialog, {});

      const panel = container.querySelector('[data-part="panel"]') as HTMLElement;
      const labelledBy = panel.getAttribute('aria-labelledby')!;
      const describedBy = panel.getAttribute('aria-describedby')!;

      const titleEl = panel.querySelector('[data-part="title"]') as HTMLElement;
      const descEl = panel.querySelector('[data-part="description"]') as HTMLElement;

      expect(titleEl.id).toBe(labelledBy);
      expect(descEl.id).toBe(describedBy);
    });

    it('does not overwrite existing IDs on title/description elements', () => {
      const stack = createDialogStack(container);

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        const frag = document.createDocumentFragment();
        const title = document.createElement('h2');
        title.setAttribute('data-part', 'title');
        title.id = 'custom-title-id';
        frag.appendChild(title);
        return frag;
      }

      stack.open(SimpleDialog, {});

      const titleEl = container.querySelector('[data-part="title"]') as HTMLElement;
      expect(titleEl.id).toBe('custom-title-id');
    });

    it('calls showModal() on the dialog element', () => {
      const stack = createDialogStack(container);
      let showModalCalled = false;

      // Monkey-patch showModal since happy-dom may not fully support it
      const origCreateElement = document.createElement.bind(document);
      const origCreate = document.createElement;
      document.createElement = ((tag: string) => {
        const el = origCreateElement(tag);
        if (tag === 'dialog') {
          const origShowModal = el.showModal?.bind(el);
          (el as HTMLDialogElement).showModal = () => {
            showModalCalled = true;
            origShowModal?.();
          };
        }
        return el;
      }) as typeof document.createElement;

      function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
        return document.createElement('div');
      }

      stack.open(SimpleDialog, {});

      document.createElement = origCreate;
      expect(showModalCalled).toBe(true);
    });
  });
});

describe('Feature: DialogStackProvider', () => {
  describe('Given a DialogStackProvider wrapping children', () => {
    describe('When useDialogStack() is called inside children', () => {
      it('Then returns a working DialogStack', () => {
        let dialogs: DialogStack | undefined;

        DialogStackProvider({
          children: () => {
            dialogs = useDialogStack();
          },
        });

        expect(dialogs).toBeDefined();
        expect(dialogs!.size).toBe(0);
      });
    });

    describe('When a dialog is opened via stack.open()', () => {
      it('Then the dialog renders inside the container div', () => {
        let dialogs: DialogStack | undefined;

        const wrapper = document.createElement('div');
        const result = DialogStackProvider({
          children: () => {
            dialogs = useDialogStack();
            return document.createElement('span');
          },
        });
        wrapper.appendChild(result);
        document.body.appendChild(wrapper);

        function SimpleDialog({ dialog }: { dialog: DialogHandle<void> }) {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'dialog-content');
          return el;
        }

        dialogs!.open(SimpleDialog, {});

        const dialogContainer = wrapper.querySelector('[data-dialog-container]');
        expect(dialogContainer).toBeTruthy();
        expect(dialogContainer!.querySelector('[data-testid="dialog-content"]')).toBeTruthy();

        document.body.removeChild(wrapper);
      });

      it('Then the container div has data-dialog-container attribute', () => {
        const wrapper = document.createElement('div');
        const result = DialogStackProvider({
          children: () => document.createElement('span'),
        });
        wrapper.appendChild(result);

        const containerDiv = wrapper.querySelector('[data-dialog-container]');
        expect(containerDiv).toBeTruthy();
        expect(containerDiv!.tagName).toBe('DIV');
      });
    });

    describe('When a dialog is closed', () => {
      it('Then the dialog is removed and promise resolves', async () => {
        let dialogs: DialogStack | undefined;

        const wrapper = document.createElement('div');
        const result = DialogStackProvider({
          children: () => {
            dialogs = useDialogStack();
            return document.createElement('span');
          },
        });
        wrapper.appendChild(result);
        document.body.appendChild(wrapper);

        function SimpleDialog({ dialog }: { dialog: DialogHandle<boolean> }) {
          const btn = document.createElement('button');
          btn.setAttribute('data-testid', 'close-btn');
          btn.addEventListener('click', () => dialog.close(true));
          return btn;
        }

        const promise = dialogs!.open(SimpleDialog, {});

        wrapper.querySelector('[data-testid="close-btn"]')!.click();
        const dialogResult = await promise;

        expect(dialogResult).toEqual({ ok: true, data: true });
        expect(dialogs!.size).toBe(0);

        document.body.removeChild(wrapper);
      });
    });

    describe('When useDialogStack() is called from a nested context', () => {
      it('Then opened dialogs can access the context from the call site', () => {
        const ProjectContext = createContext<string>();
        let capturedProject: string | undefined;

        function MyDialog({ dialog }: { dialog: DialogHandle<void> }) {
          capturedProject = useContext(ProjectContext);
          return document.createElement('div');
        }

        let dialogs: DialogStack | undefined;

        DialogStackProvider({
          children: () => {
            ProjectContext.Provider('test-project', () => {
              dialogs = useDialogStack();
            });
          },
        });

        // Called outside any Provider (simulates onClick handler)
        dialogs!.open(MyDialog, {});

        expect(capturedProject).toBe('test-project');
      });
    });
  });

  describe('Given DialogStackProvider is NOT in the tree', () => {
    describe('When useDialogStack() is called', () => {
      it('Then throws "must be called within DialogStackProvider"', () => {
        expect(() => useDialogStack()).toThrow(
          'useDialogStack() must be called within DialogStackProvider',
        );
      });
    });
  });
});

describe('Feature: dialogs.confirm()', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a dialog stack', () => {
    describe('When confirm() is called and user clicks the confirm button', () => {
      it('Then returns true', async () => {
        const stack = createDialogStack(container);
        const resultPromise = stack.confirm({ title: 'Delete?' });

        // Find the confirm button in the rendered dialog
        const confirmBtn = container.querySelector(
          '[data-part="confirm-action"]',
        ) as HTMLButtonElement;
        expect(confirmBtn).toBeTruthy();
        confirmBtn.click();

        const result = await resultPromise;
        expect(result).toBe(true);
      });
    });

    describe('When confirm() is called and user clicks the cancel button', () => {
      it('Then returns false', async () => {
        const stack = createDialogStack(container);
        const resultPromise = stack.confirm({ title: 'Delete?' });

        const cancelBtn = container.querySelector(
          '[data-part="confirm-cancel"]',
        ) as HTMLButtonElement;
        expect(cancelBtn).toBeTruthy();
        cancelBtn.click();

        const result = await resultPromise;
        expect(result).toBe(false);
      });
    });

    describe('When confirm() is called with custom labels', () => {
      it('Then uses the provided confirm and cancel labels', () => {
        const stack = createDialogStack(container);
        stack.confirm({ title: 'Sure?', confirm: 'Yes', cancel: 'No' });

        const confirmBtn = container.querySelector(
          '[data-part="confirm-action"]',
        ) as HTMLButtonElement;
        const cancelBtn = container.querySelector(
          '[data-part="confirm-cancel"]',
        ) as HTMLButtonElement;
        expect(confirmBtn.textContent).toBe('Yes');
        expect(cancelBtn.textContent).toBe('No');
      });
    });

    describe('When confirm() is called with a title and description', () => {
      it('Then renders title and description elements', () => {
        const stack = createDialogStack(container);
        stack.confirm({ title: 'Delete?', description: 'This cannot be undone.' });

        const title = container.querySelector('[data-part="title"]') as HTMLElement;
        const desc = container.querySelector('[data-part="description"]') as HTMLElement;
        expect(title).toBeTruthy();
        expect(title.textContent).toBe('Delete?');
        expect(desc).toBeTruthy();
        expect(desc.textContent).toBe('This cannot be undone.');
      });
    });

    describe('When confirm() is called with intent "danger"', () => {
      it('Then confirm button has data-intent="danger"', () => {
        const stack = createDialogStack(container);
        stack.confirm({ title: 'Delete?', intent: 'danger' });

        const confirmBtn = container.querySelector(
          '[data-part="confirm-action"]',
        ) as HTMLButtonElement;
        expect(confirmBtn.getAttribute('data-intent')).toBe('danger');
      });
    });

    describe('When confirm() is called with title and description', () => {
      it('Then title and description elements have ARIA-matching IDs', () => {
        const stack = createDialogStack(container);
        stack.confirm({ title: 'Delete?', description: 'Cannot undo.' });

        const panel = container.querySelector('[data-part="panel"]') as HTMLElement;
        const labelledBy = panel.getAttribute('aria-labelledby')!;
        const describedBy = panel.getAttribute('aria-describedby')!;

        const titleEl = panel.querySelector('[data-part="title"]') as HTMLElement;
        const descEl = panel.querySelector('[data-part="description"]') as HTMLElement;

        expect(titleEl.id).toBe(labelledBy);
        expect(descEl.id).toBe(describedBy);
      });
    });

    describe('When confirm() is called', () => {
      it('Then the dialog is non-dismissible by default', () => {
        const stack = createDialogStack(container);
        stack.confirm({ title: 'Sure?' });

        // The dialog should be open
        const dialog = container.querySelector('dialog') as HTMLDialogElement;
        expect(dialog).toBeTruthy();

        // Dispatch cancel event (simulates Escape) — should NOT dismiss
        const cancelEvent = new Event('cancel', { cancelable: true });
        dialog.dispatchEvent(cancelEvent);

        // Dialog should still be there
        expect(container.querySelector('dialog')).toBeTruthy();
      });
    });

    describe('When confirm() is called with dismissible: true and user presses Escape', () => {
      it('Then returns false', async () => {
        const stack = createDialogStack(container);
        const resultPromise = stack.confirm({ title: 'Sure?', dismissible: true });

        const dialog = container.querySelector('dialog') as HTMLDialogElement;
        dialog.dispatchEvent(new Event('cancel', { bubbles: false }));

        const result = await resultPromise;
        expect(result).toBe(false);
      });
    });
  });
});

describe('Feature: DialogStackProvider hydration', () => {
  afterEach(() => {
    endHydration();
  });

  describe('Given SSR output with DialogStackProvider wrapping children', () => {
    describe('When hydration runs', () => {
      it('Then the result is an HTMLElement with data-dialog-container', () => {
        // Simulate SSR output: <div data-dialog-container><span>child</span></div>
        const root = document.createElement('div');
        root.innerHTML = '<div data-dialog-container=""><span>child</span></div>';

        startHydration(root);

        let dialogs: DialogStack | undefined;
        const result = DialogStackProvider({
          children: () => {
            dialogs = useDialogStack();
            // During hydration, __element should claim the existing <span>
            const child = __element('span');
            return child;
          },
        });

        endHydration();

        // Result must be an HTMLElement (not a DocumentFragment)
        expect(result).toBeInstanceOf(HTMLElement);
        // The container div should have the marker attribute
        expect((result as HTMLElement).getAttribute('data-dialog-container')).toBe('');
        // Children should be inside the container
        expect((result as HTMLElement).querySelector('span')).toBeTruthy();
        expect(dialogs).toBeDefined();
      });

      it('Then children are claimed from SSR DOM (not recreated)', () => {
        const root = document.createElement('div');
        root.innerHTML = '<div data-dialog-container=""><span>content</span></div>';
        const ssrSpan = root.querySelector('span')!;

        startHydration(root);

        let claimedSpan: Element | undefined;
        DialogStackProvider({
          children: () => {
            useDialogStack();
            claimedSpan = __element('span');
            return claimedSpan;
          },
        });

        endHydration();

        // The span should be the same DOM node (claimed, not recreated)
        expect(claimedSpan).toBe(ssrSpan);
      });
    });
  });
});

describe('Feature: DialogStackProvider hydration via mount()', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'app';
    document.body.appendChild(root);
    resetInjectedStyles();
  });

  afterEach(() => {
    document.body.removeChild(root);
    resetInjectedStyles();
  });

  describe('Given SSR output with ThemeProvider > DialogStackProvider > children', () => {
    describe('When mount() hydrates the app', () => {
      it('Then children survive hydration inside the container div', () => {
        // Simulate SSR output matching the todo-app template structure:
        // <div data-theme="light"><div data-dialog-container=""><div><header>App</header><main>Content</main></div></div></div>
        root.innerHTML =
          '<div data-theme="light"><div data-dialog-container="">' +
          '<div><header>App</header><main>Content</main></div>' +
          '</div></div>';

        const ssrContainer = root.querySelector('[data-dialog-container]')!;
        const ssrHeader = root.querySelector('header')!;
        const ssrMain = root.querySelector('main')!;

        let dialogs: DialogStack | undefined;

        const App = () => {
          return ThemeProvider({
            theme: 'light',
            children: () =>
              DialogStackProvider({
                children: () => {
                  dialogs = useDialogStack();
                  const shell = __element('div');
                  __enterChildren(shell);

                  const header = __element('header');
                  __enterChildren(header);
                  __append(header, __staticText('App'));
                  __exitChildren();
                  __append(shell, header);

                  const main = __element('main');
                  __enterChildren(main);
                  __append(main, __staticText('Content'));
                  __exitChildren();
                  __append(shell, main);

                  __exitChildren();
                  return shell;
                },
              }),
          });
        };

        const handle = mount(App);

        // Children must survive hydration
        const container = root.querySelector('[data-dialog-container]')!;
        expect(container).toBe(ssrContainer);
        expect(container.querySelector('header')).toBe(ssrHeader);
        expect(container.querySelector('main')).toBe(ssrMain);
        expect(container.children.length).toBeGreaterThanOrEqual(1);
        expect(root.textContent).toContain('App');
        expect(root.textContent).toContain('Content');

        // DialogStack context must be available
        expect(dialogs).toBeDefined();

        handle.unmount();
      });

      it('Then children are adopted (same DOM references, not recreated)', () => {
        root.innerHTML =
          '<div data-theme="light"><div data-dialog-container="">' +
          '<span>child-content</span>' +
          '</div></div>';

        const ssrSpan = root.querySelector('span')!;
        let claimedSpan: Element | undefined;

        const App = () => {
          return ThemeProvider({
            theme: 'light',
            children: () =>
              DialogStackProvider({
                children: () => {
                  useDialogStack();
                  claimedSpan = __element('span');
                  __enterChildren(claimedSpan);
                  __append(claimedSpan, __staticText('child-content'));
                  __exitChildren();
                  return claimedSpan;
                },
              }),
          });
        };

        const handle = mount(App);

        // The span should be the same DOM node (adopted, not recreated)
        expect(claimedSpan).toBe(ssrSpan);

        handle.unmount();
      });

      it('Then no hydration warnings are produced', () => {
        root.innerHTML =
          '<div data-theme="light"><div data-dialog-container="">' +
          '<div><header>App</header></div>' +
          '</div></div>';

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const App = () => {
          return ThemeProvider({
            theme: 'light',
            children: () =>
              DialogStackProvider({
                children: () => {
                  useDialogStack();
                  const shell = __element('div');
                  __enterChildren(shell);
                  const header = __element('header');
                  __enterChildren(header);
                  __append(header, __staticText('App'));
                  __exitChildren();
                  __append(shell, header);
                  __exitChildren();
                  return shell;
                },
              }),
          });
        };

        mount(App);

        const claimWarns = warnSpy.mock.calls.filter(
          (args) => typeof args[0] === 'string' && args[0].includes('not claimed'),
        );
        expect(claimWarns).toHaveLength(0);

        warnSpy.mockRestore();
      });

      it('Then event handlers work on adopted elements inside DialogStackProvider', () => {
        root.innerHTML =
          '<div data-theme="light"><div data-dialog-container="">' +
          '<div><button>Delete</button></div>' +
          '</div></div>';

        const ssrButton = root.querySelector('button')!;
        let clicked = false;

        const App = () => {
          return ThemeProvider({
            theme: 'light',
            children: () =>
              DialogStackProvider({
                children: () => {
                  useDialogStack();
                  const wrapper = __element('div');
                  __enterChildren(wrapper);
                  const btn = __element('button');
                  __on(btn, 'click', () => {
                    clicked = true;
                  });
                  __enterChildren(btn);
                  __append(btn, __staticText('Delete'));
                  __exitChildren();
                  __append(wrapper, btn);
                  __exitChildren();
                  return wrapper;
                },
              }),
          });
        };

        mount(App);

        // Button should be the SSR button (adopted)
        expect(root.querySelector('button')).toBe(ssrButton);

        // Click handler must work
        ssrButton.click();
        expect(clicked).toBe(true);
      });
    });
  });

  describe('Given SSR output with DialogStackProvider (no ThemeProvider)', () => {
    describe('When mount() hydrates the app', () => {
      it('Then children survive hydration', () => {
        root.innerHTML =
          '<div data-dialog-container="">' + '<div><h1>Hello</h1><p>World</p></div>' + '</div>';

        const ssrH1 = root.querySelector('h1')!;
        const ssrP = root.querySelector('p')!;

        const App = () => {
          return DialogStackProvider({
            children: () => {
              useDialogStack();
              const content = __element('div');
              __enterChildren(content);

              const h1 = __element('h1');
              __enterChildren(h1);
              __append(h1, __staticText('Hello'));
              __exitChildren();
              __append(content, h1);

              const p = __element('p');
              __enterChildren(p);
              __append(p, __staticText('World'));
              __exitChildren();
              __append(content, p);

              __exitChildren();
              return content;
            },
          });
        };

        const handle = mount(App);

        expect(root.querySelector('h1')).toBe(ssrH1);
        expect(root.querySelector('p')).toBe(ssrP);
        expect(root.textContent).toContain('Hello');
        expect(root.textContent).toContain('World');

        handle.unmount();
      });
    });
  });

  describe('Given no SSR content (CSR render)', () => {
    describe('When mount() renders DialogStackProvider from scratch', () => {
      it('Then children are rendered inside the container div', () => {
        // Empty root = CSR path
        let dialogs: DialogStack | undefined;

        const App = () => {
          return DialogStackProvider({
            children: () => {
              dialogs = useDialogStack();
              const content = __element('div');
              __enterChildren(content);

              const h1 = __element('h1');
              __enterChildren(h1);
              __append(h1, __staticText('CSR Content'));
              __exitChildren();
              __append(content, h1);

              __exitChildren();
              return content;
            },
          });
        };

        const handle = mount(App);

        const container = root.querySelector('[data-dialog-container]')!;
        expect(container).toBeTruthy();
        expect(container.querySelector('h1')).toBeTruthy();
        expect(container.textContent).toContain('CSR Content');
        expect(dialogs).toBeDefined();

        handle.unmount();
      });
    });
  });

  describe('Given SSR output with multiple sibling children in DialogStackProvider', () => {
    describe('When mount() hydrates', () => {
      it('Then all children survive hydration (array children)', () => {
        root.innerHTML =
          '<div data-dialog-container="">' +
          '<header>Nav</header><main>Body</main><footer>Foot</footer>' +
          '</div>';

        const ssrHeader = root.querySelector('header')!;
        const ssrMain = root.querySelector('main')!;
        const ssrFooter = root.querySelector('footer')!;

        const App = () => {
          return DialogStackProvider({
            children: () => {
              useDialogStack();
              // Multiple children returned as array (compiler generates this for 2+ children)
              const header = __element('header');
              __enterChildren(header);
              __append(header, __staticText('Nav'));
              __exitChildren();

              const main = __element('main');
              __enterChildren(main);
              __append(main, __staticText('Body'));
              __exitChildren();

              const footer = __element('footer');
              __enterChildren(footer);
              __append(footer, __staticText('Foot'));
              __exitChildren();

              return [header, main, footer];
            },
          });
        };

        const handle = mount(App);

        expect(root.querySelector('header')).toBe(ssrHeader);
        expect(root.querySelector('main')).toBe(ssrMain);
        expect(root.querySelector('footer')).toBe(ssrFooter);
        expect(root.textContent).toContain('Nav');
        expect(root.textContent).toContain('Body');
        expect(root.textContent).toContain('Foot');

        handle.unmount();
      });
    });
  });
});
