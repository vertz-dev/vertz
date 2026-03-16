import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { ComposedAlertDialog } from '../alert-dialog-composed';

function createAlertDialogTree(classes?: Record<string, string>) {
  const triggerBtn = document.createElement('button');
  triggerBtn.textContent = 'Delete';

  let cancelEl!: HTMLElement;
  let actionEl!: HTMLElement;

  const root = ComposedAlertDialog({
    children: () => {
      const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
      const titleEl = ComposedAlertDialog.Title({ children: ['Are you sure?'] });
      const descEl = ComposedAlertDialog.Description({
        children: ['This action cannot be undone.'],
      });
      const headerEl = ComposedAlertDialog.Header({ children: [titleEl, descEl] });
      cancelEl = ComposedAlertDialog.Cancel({ children: ['Cancel'] });
      actionEl = ComposedAlertDialog.Action({ children: ['Delete'] });
      const footerEl = ComposedAlertDialog.Footer({ children: [cancelEl, actionEl] });
      const contentEl = ComposedAlertDialog.Content({
        children: [headerEl, footerEl],
      });
      return [triggerEl, contentEl];
    },
    classes,
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
      it('Then opens the dialog with role="alertdialog"', () => {
        const { root, triggerBtn } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();

        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(panel).not.toBeNull();
        expect(panel!.getAttribute('data-state')).toBe('open');
      });

      it('Then sets aria-labelledby pointing to the title', () => {
        const { root } = createAlertDialogTree();
        container.appendChild(root);

        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        const labelledBy = panel!.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        // The referenced element must exist in the DOM
        const titleEl = root.querySelector(`#${labelledBy}`);
        expect(titleEl).not.toBeNull();
        expect(titleEl!.textContent).toBe('Are you sure?');
      });

      it('Then sets aria-describedby pointing to the description', () => {
        const { root } = createAlertDialogTree();
        container.appendChild(root);

        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        const describedBy = panel!.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        // The referenced element must exist in the DOM
        const descEl = root.querySelector(`#${describedBy}`);
        expect(descEl).not.toBeNull();
        expect(descEl!.textContent).toBe('This action cannot be undone.');
      });
    });
  });

  describe('Given an AlertDialog with action and cancel buttons', () => {
    describe('When Escape is pressed', () => {
      it('Then does NOT close the dialog (blocked)', () => {
        const { root, triggerBtn } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(panel!.getAttribute('data-state')).toBe('open');

        panel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel!.getAttribute('data-state')).toBe('open');
      });
    });

    describe('When overlay is clicked', () => {
      it('Then does NOT close the dialog (blocked)', () => {
        const { root, triggerBtn } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(panel!.getAttribute('data-state')).toBe('open');

        const overlay = root.querySelector('[data-alertdialog-overlay]') as HTMLElement;
        overlay!.click();
        expect(panel!.getAttribute('data-state')).toBe('open');
      });
    });

    describe('When Cancel is clicked', () => {
      it('Then closes the dialog', () => {
        const { root, triggerBtn, cancelEl } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(panel!.getAttribute('data-state')).toBe('open');

        cancelEl.click();
        expect(panel!.getAttribute('data-state')).toBe('closed');
      });
    });

    describe('When Action is clicked', () => {
      it('Then closes the dialog', () => {
        const { root, triggerBtn, actionEl } = createAlertDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(panel!.getAttribute('data-state')).toBe('open');

        actionEl.click();
        expect(panel!.getAttribute('data-state')).toBe('closed');
      });
    });
  });

  describe('Given an AlertDialog with classes prop', () => {
    describe('When rendered and opened', () => {
      it('Then applies overlay class', () => {
        const { root, triggerBtn } = createAlertDialogTree({ overlay: 'test-overlay' });
        container.appendChild(root);

        triggerBtn.click();

        const overlay = root.querySelector('[data-alertdialog-overlay]') as HTMLElement;
        expect(overlay!.className).toBe('test-overlay');
      });

      it('Then applies content class', () => {
        const { root } = createAlertDialogTree({ content: 'test-content' });
        container.appendChild(root);

        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        expect(panel!.className).toContain('test-content');
      });

      it('Then applies title class', () => {
        const { root } = createAlertDialogTree({ title: 'test-title' });
        container.appendChild(root);

        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        const title = panel!.querySelector('h2') as HTMLElement;
        expect(title!.className).toBe('test-title');
      });
    });
  });

  describe('Given onOpenChange callback', () => {
    it('Then calls the callback when dialog opens and closes', () => {
      const onOpenChange = vi.fn();
      const triggerBtn = document.createElement('button');
      let cancelEl!: HTMLElement;

      const root = ComposedAlertDialog({
        children: () => {
          const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
          cancelEl = ComposedAlertDialog.Cancel({ children: ['Cancel'] });
          const contentEl = ComposedAlertDialog.Content({ children: [cancelEl] });
          return [triggerEl, contentEl];
        },
        onOpenChange,
      });
      container.appendChild(root);

      triggerBtn.click();
      expect(onOpenChange).toHaveBeenCalledWith(true);

      cancelEl.click();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Given onAction callback', () => {
    it('Then calls the callback when Action is clicked', () => {
      const onAction = vi.fn();
      const triggerBtn = document.createElement('button');
      let actionEl!: HTMLElement;

      const root = ComposedAlertDialog({
        children: () => {
          const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
          actionEl = ComposedAlertDialog.Action({ children: ['Delete'] });
          const contentEl = ComposedAlertDialog.Content({ children: [actionEl] });
          return [triggerEl, contentEl];
        },
        onAction,
      });
      container.appendChild(root);

      triggerBtn.click();
      actionEl.click();

      expect(onAction).toHaveBeenCalledTimes(1);
    });

    it('Then fires onAction exactly once even when Action has its own onClick', () => {
      const onAction = vi.fn();
      const onClick = vi.fn();
      const triggerBtn = document.createElement('button');
      let actionEl!: HTMLElement;

      const root = ComposedAlertDialog({
        children: () => {
          const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
          actionEl = ComposedAlertDialog.Action({ children: ['Confirm'], onClick });
          const contentEl = ComposedAlertDialog.Content({ children: [actionEl] });
          return [triggerEl, contentEl];
        },
        onAction,
      });
      container.appendChild(root);

      triggerBtn.click();
      actionEl.click();

      expect(onAction).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledTimes(1);
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

  describe('Given an AlertDialog rendered inside a disposal scope', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then removeEventListener is called for the trigger click handler', () => {
        const scope = pushScope();
        const triggerBtn = document.createElement('button');

        const root = ComposedAlertDialog({
          children: () => {
            const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
            const contentEl = ComposedAlertDialog.Content({ children: [] });
            return [triggerEl, contentEl];
          },
        });
        container.appendChild(root);
        popScope();

        const spy = vi.spyOn(triggerBtn, 'removeEventListener');
        runCleanups(scope);

        expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
      });

      it('Then removeEventListener is called for the content delegation handler', () => {
        const scope = pushScope();
        const triggerBtn = document.createElement('button');

        const root = ComposedAlertDialog({
          children: () => {
            const triggerEl = ComposedAlertDialog.Trigger({ children: [triggerBtn] });
            const contentEl = ComposedAlertDialog.Content({ children: [] });
            return [triggerEl, contentEl];
          },
        });
        container.appendChild(root);
        popScope();

        const panel = root.querySelector('[role="alertdialog"]') as HTMLElement;
        const spy = vi.spyOn(panel, 'removeEventListener');
        runCleanups(scope);

        expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
      });
    });
  });
});
