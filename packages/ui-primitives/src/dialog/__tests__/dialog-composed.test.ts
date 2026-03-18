import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedDialog } from '../dialog-composed';

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 20));
}

function getConnectedPanel(root: HTMLElement) {
  const renderedPanel = root.querySelector('[role="dialog"]') as HTMLDialogElement;
  return document.getElementById(renderedPanel.id) as HTMLDialogElement;
}

function createDialogTree(
  classes?: Record<string, string>,
  options?: { showClose?: boolean; onOpenChange?: (open: boolean) => void },
) {
  const triggerBtn = document.createElement('button');
  triggerBtn.textContent = 'Open';

  let closeEl!: HTMLElement;

  const root = ComposedDialog({
    classes,
    onOpenChange: options?.onOpenChange,
    children: () => {
      const triggerEl = ComposedDialog.Trigger({ children: [triggerBtn] });
      const titleEl = ComposedDialog.Title({ children: ['Dialog Title'] });
      const descriptionEl = ComposedDialog.Description({ children: ['Dialog Description'] });
      const headerEl = ComposedDialog.Header({ children: [titleEl, descriptionEl] });
      closeEl = ComposedDialog.Close({ children: ['Close'] });
      const footerEl = ComposedDialog.Footer({ children: [closeEl] });
      const contentEl = ComposedDialog.Content({
        showClose: options?.showClose,
        children: [headerEl, footerEl],
      });
      return [triggerEl, contentEl];
    },
  });

  return { root, triggerBtn, closeEl };
}

describe('Composed Dialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Dialog with Trigger and Content sub-components', () => {
    describe('When the trigger is clicked', () => {
      it('Then opens the native dialog', () => {
        const { root, triggerBtn } = createDialogTree();
        container.appendChild(root);

        triggerBtn.click();

        const panel = getConnectedPanel(root);
        expect(panel).not.toBeNull();
        expect(panel.getAttribute('data-state')).toBe('open');
      });

      it('Then sets aria-labelledby pointing to the title', () => {
        const { root } = createDialogTree();
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        const labelledBy = panel.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(root.querySelector(`#${labelledBy}`)?.textContent).toBe('Dialog Title');
      });

      it('Then sets aria-describedby pointing to the description', () => {
        const { root } = createDialogTree();
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        const describedBy = panel.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(root.querySelector(`#${describedBy}`)?.textContent).toBe('Dialog Description');
      });
    });

    describe('When Escape is pressed while dialog is open', () => {
      it('Then closes the dialog', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn } = createDialogTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        panel.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
        await flush();

        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    describe('When the backdrop is clicked', () => {
      it('Then closes the dialog', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn } = createDialogTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        panel.click();
        await flush();

        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    describe('When Dialog.Close is clicked', () => {
      it('Then closes the dialog', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn, closeEl } = createDialogTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        closeEl.click();
        await flush();

        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Given a Dialog with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies content, title, header, footer, and close classes', () => {
        const { root } = createDialogTree({
          content: 'test-content',
          title: 'test-title',
          header: 'test-header',
          footer: 'test-footer',
          close: 'test-close',
        });
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        expect(panel.className).toContain('test-content');
        expect(panel.querySelector('h2')?.className).toBe('test-title');
        expect(
          Array.from(panel.querySelectorAll('div')).some((el) => el.className === 'test-header'),
        ).toBe(true);
        expect(
          Array.from(panel.querySelectorAll('div')).some((el) => el.className === 'test-footer'),
        ).toBe(true);
        expect(panel.querySelector('[data-slot="dialog-close"]')?.className).toContain(
          'test-close',
        );
      });
    });
  });

  describe('Given a Dialog.Content with per-instance class', () => {
    describe('When rendered', () => {
      it('Then merges per-instance class with classes.content via space concatenation', () => {
        const triggerBtn = document.createElement('button');

        const root = ComposedDialog({
          classes: { content: 'dialog-panel' },
          children: () => {
            const triggerEl = ComposedDialog.Trigger({ children: [triggerBtn] });
            const contentEl = ComposedDialog.Content({
              class: 'max-w-md',
              children: [],
            });
            return [triggerEl, contentEl];
          },
        });

        const panel = root.querySelector('[role="dialog"]') as HTMLDialogElement;
        expect(panel.className).toBe('dialog-panel max-w-md');
      });
    });
  });

  describe('Given a Dialog.Content with showClose disabled', () => {
    it('Then does not render the default close icon button', () => {
      const { root } = createDialogTree(undefined, { showClose: false });
      container.appendChild(root);

      const iconClose = getConnectedPanel(root).querySelector('button[aria-label="Close"]');
      expect(iconClose).toBeNull();
    });
  });

  describe('Given onOpenChange callback', () => {
    it('Then calls the callback when dialog opens and closes', async () => {
      const onOpenChange = vi.fn();
      const triggerBtn = document.createElement('button');
      let closeEl!: HTMLElement;

      const root = ComposedDialog({
        onOpenChange,
        children: () => {
          const triggerEl = ComposedDialog.Trigger({ children: [triggerBtn] });
          closeEl = ComposedDialog.Close({ children: ['Close'] });
          const contentEl = ComposedDialog.Content({ children: [closeEl] });
          return [triggerEl, contentEl];
        },
      });
      container.appendChild(root);

      triggerBtn.click();
      expect(onOpenChange).toHaveBeenCalledWith(true);

      closeEl.click();
      await flush();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Given a Dialog.Trigger rendered outside Dialog', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedDialog.Trigger({ children: ['Orphan'] });
        }).toThrow('<Dialog.Trigger> must be used inside <Dialog>');
      });
    });
  });

  describe('Given a Dialog.Content rendered outside Dialog', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedDialog.Content({ children: ['Orphan'] });
        }).toThrow('<Dialog.Content> must be used inside <Dialog>');
      });
    });
  });
});
