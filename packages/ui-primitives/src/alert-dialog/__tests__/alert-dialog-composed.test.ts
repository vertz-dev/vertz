import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedAlertDialog } from '../alert-dialog-composed';

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 20));
}

function getConnectedPanel(root: HTMLElement) {
  const renderedPanel = root.querySelector('[role="alertdialog"]') as HTMLDialogElement;
  return document.getElementById(renderedPanel.id) as HTMLDialogElement;
}

function createAlertDialogTree(
  classes?: Record<string, string>,
  options?: { onOpenChange?: (open: boolean) => void; onAction?: () => void },
) {
  const triggerBtn = document.createElement('button');
  triggerBtn.textContent = 'Delete';

  let cancelEl!: HTMLElement;
  let actionEl!: HTMLElement;

  const root = ComposedAlertDialog({
    classes,
    onOpenChange: options?.onOpenChange,
    onAction: options?.onAction,
    children: () => {
      const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
      const titleEl = ComposedAlertDialog.Title({ children: ['Are you sure?'] });
      const descriptionEl = ComposedAlertDialog.Description({
        children: ['This action cannot be undone.'],
      });
      const headerEl = ComposedAlertDialog.Header({ children: [titleEl, descriptionEl] });
      cancelEl = ComposedAlertDialog.Cancel({ children: ['Cancel'] });
      actionEl = ComposedAlertDialog.Action({ children: ['Delete'] });
      const footerEl = ComposedAlertDialog.Footer({ children: [cancelEl, actionEl] });
      const contentEl = ComposedAlertDialog.Content({
        children: [headerEl, footerEl],
      });
      return [triggerEl, contentEl];
    },
  });

  return { root, triggerBtn, cancelEl, actionEl };
}

describe('Composed AlertDialog', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given an AlertDialog with Trigger and Content sub-components', () => {
    describe('When the trigger is clicked', () => {
      it('Then opens the alert dialog', () => {
        const { root, triggerBtn } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();

        const panel = getConnectedPanel(root);
        expect(panel).not.toBeNull();
        expect(panel.getAttribute('data-state')).toBe('open');
      });

      it('Then sets aria-labelledby pointing to the title', () => {
        const { root } = createAlertDialogTree();
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        const labelledBy = panel.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(root.querySelector(`#${labelledBy}`)?.textContent).toBe('Are you sure?');
      });

      it('Then sets aria-describedby pointing to the description', () => {
        const { root } = createAlertDialogTree();
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        const describedBy = panel.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(root.querySelector(`#${describedBy}`)?.textContent).toBe(
          'This action cannot be undone.',
        );
      });
    });
  });

  describe('Given an AlertDialog with action and cancel buttons', () => {
    describe('When Escape is pressed', () => {
      it('Then does NOT close the dialog', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn } = createAlertDialogTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        panel.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));
        await flush();

        expect(onOpenChange).not.toHaveBeenCalledWith(false);
      });
    });

    describe('When Cancel is clicked', () => {
      it('Then closes the dialog', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn, cancelEl } = createAlertDialogTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        cancelEl.click();
        await flush();

        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    describe('When Action is clicked', () => {
      it('Then closes the dialog', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn, actionEl } = createAlertDialogTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        actionEl.click();
        await flush();

        expect(onOpenChange).toHaveBeenCalledWith(false);
      });

      it('Then calls onAction exactly once', async () => {
        const onAction = vi.fn();
        const { root, triggerBtn, actionEl } = createAlertDialogTree(undefined, { onAction });
        container.appendChild(root);

        triggerBtn.click();
        actionEl.click();
        await flush();

        expect(onAction).toHaveBeenCalledTimes(1);
      });

      it('Then preserves the child onClick handler', async () => {
        const onAction = vi.fn();
        const onClick = vi.fn();
        const triggerBtn = document.createElement('button');
        let actionEl!: HTMLElement;

        const root = ComposedAlertDialog({
          onAction,
          children: () => {
            const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
            actionEl = ComposedAlertDialog.Action({ children: ['Confirm'], onClick });
            const contentEl = ComposedAlertDialog.Content({ children: [actionEl] });
            return [triggerEl, contentEl];
          },
        });
        container.appendChild(root);

        triggerBtn.click();
        actionEl.click();
        await flush();

        expect(onAction).toHaveBeenCalledTimes(1);
        expect(onClick).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Given an AlertDialog with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies content, title, description, header, and footer classes', () => {
        const { root } = createAlertDialogTree({
          content: 'test-content',
          title: 'test-title',
          description: 'test-description',
          header: 'test-header',
          footer: 'test-footer',
        });
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        expect(panel.className).toContain('test-content');
        expect(panel.querySelector('h2')?.className).toBe('test-title');
        expect(panel.querySelector('p')?.className).toBe('test-description');
        expect(
          Array.from(panel.querySelectorAll('div')).some((el) => el.className === 'test-header'),
        ).toBe(true);
        expect(
          Array.from(panel.querySelectorAll('div')).some((el) => el.className === 'test-footer'),
        ).toBe(true);
      });
    });
  });

  describe('Given onOpenChange callback', () => {
    it('Then calls the callback when dialog opens and closes', async () => {
      const onOpenChange = vi.fn();
      const triggerBtn = document.createElement('button');
      let cancelEl!: HTMLElement;

      const root = ComposedAlertDialog({
        onOpenChange,
        children: () => {
          const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
          cancelEl = ComposedAlertDialog.Cancel({ children: ['Cancel'] });
          const contentEl = ComposedAlertDialog.Content({ children: [cancelEl] });
          return [triggerEl, contentEl];
        },
      });
      container.appendChild(root);

      triggerBtn.click();
      expect(onOpenChange).toHaveBeenCalledWith(true);

      cancelEl.click();
      await flush();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Given an open AlertDialog', () => {
    describe('When close is triggered via Cancel button', () => {
      it('Then sets data-state to closed but defers dialog.close() for animation', () => {
        const { root, triggerBtn, cancelEl } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.open).toBe(true);

        const closeSpy = vi.spyOn(panel, 'close');

        cancelEl.click();

        expect(panel.getAttribute('data-state')).toBe('closed');
        expect(closeSpy).not.toHaveBeenCalled();

        panel.dispatchEvent(new Event('animationend'));
        expect(closeSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Given an AlertDialog.Trigger rendered outside AlertDialog', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedAlertDialog.Trigger({ children: ['Orphan'] });
        }).toThrow('<AlertDialog.Trigger> must be used inside <AlertDialog>');
      });
    });
  });

  describe('Given an AlertDialog.Content rendered outside AlertDialog', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedAlertDialog.Content({ children: ['Orphan'] });
        }).toThrow('<AlertDialog.Content> must be used inside <AlertDialog>');
      });
    });
  });
});
