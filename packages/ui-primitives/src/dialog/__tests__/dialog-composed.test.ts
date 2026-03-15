import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedDialog } from '../dialog-composed';

/**
 * Helper that creates a composed dialog tree.
 * Children are passed as a thunk to simulate the compiler's behavior:
 * in real JSX, children are wrapped in functions for lazy evaluation,
 * which means sub-components execute inside the Provider scope.
 */
function createDialogTree(classes?: Record<string, string>) {
  const triggerBtn = document.createElement('button');
  triggerBtn.textContent = 'Open';

  let closeEl!: HTMLElement;

  const root = ComposedDialog({
    children: () => {
      const triggerEl = ComposedDialog.Trigger({ children: [triggerBtn] });
      const titleEl = ComposedDialog.Title({ children: ['Dialog Title'] });
      const descEl = ComposedDialog.Description({ children: ['Dialog Description'] });
      const headerEl = ComposedDialog.Header({ children: [titleEl, descEl] });
      closeEl = ComposedDialog.Close({ children: ['Cancel'] });
      const footerEl = ComposedDialog.Footer({ children: [closeEl] });
      const contentEl = ComposedDialog.Content({
        children: [headerEl, footerEl],
      });
      return [triggerEl, contentEl];
    },
    classes,
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
      it('Then opens the dialog with role="dialog"', () => {
        const { root, triggerBtn } = createDialogTree();
        container.appendChild(root);

        triggerBtn.click();

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(panel).not.toBeNull();
        expect(panel!.getAttribute('data-state')).toBe('open');
      });

      it('Then sets aria-labelledby pointing to the title', () => {
        const { root } = createDialogTree();
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const labelledBy = panel!.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        // The referenced element must exist in the DOM
        const titleEl = root.querySelector(`#${labelledBy}`);
        expect(titleEl).not.toBeNull();
        expect(titleEl!.textContent).toBe('Dialog Title');
      });

      it('Then sets aria-describedby pointing to the description', () => {
        const { root } = createDialogTree();
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const describedBy = panel!.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        // The referenced element must exist in the DOM
        const descEl = root.querySelector(`#${describedBy}`);
        expect(descEl).not.toBeNull();
        expect(descEl!.textContent).toBe('Dialog Description');
      });
    });

    describe('When Escape is pressed while dialog is open', () => {
      it('Then closes the dialog', () => {
        const { root, triggerBtn } = createDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(panel!.getAttribute('data-state')).toBe('open');

        panel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(panel!.getAttribute('data-state')).toBe('closed');
      });
    });

    describe('When Dialog.Close is clicked', () => {
      it('Then closes the dialog', () => {
        const { root, triggerBtn, closeEl } = createDialogTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(panel!.getAttribute('data-state')).toBe('open');

        closeEl.click();
        expect(panel!.getAttribute('data-state')).toBe('closed');
      });
    });
  });

  describe('Given a Dialog with classes prop', () => {
    describe('When rendered and opened', () => {
      it('Then applies overlay class to the overlay element', () => {
        const { root, triggerBtn } = createDialogTree({ overlay: 'test-overlay' });
        container.appendChild(root);

        triggerBtn.click();

        const overlay = root.querySelector('[data-dialog-overlay]') as HTMLElement;
        expect(overlay!.className).toBe('test-overlay');
      });

      it('Then applies content class to the content panel', () => {
        const { root } = createDialogTree({ content: 'test-content' });
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(panel!.className).toContain('test-content');
      });

      it('Then applies title class to the title element', () => {
        const { root } = createDialogTree({ title: 'test-title' });
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const title = panel!.querySelector('h2') as HTMLElement;
        expect(title!.className).toBe('test-title');
      });

      it('Then applies header class to the header element', () => {
        const { root } = createDialogTree({ header: 'test-header' });
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const allDivs = panel!.querySelectorAll('div');
        const headerDiv = Array.from(allDivs).find((d) => d.className === 'test-header');
        expect(headerDiv).not.toBeUndefined();
      });

      it('Then applies footer class to the footer element', () => {
        const { root } = createDialogTree({ footer: 'test-footer' });
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const allDivs = panel!.querySelectorAll('div');
        const footerDiv = Array.from(allDivs).find((d) => d.className === 'test-footer');
        expect(footerDiv).not.toBeUndefined();
      });

      it('Then applies close class to close buttons', () => {
        const { root } = createDialogTree({ close: 'test-close' });
        container.appendChild(root);

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const closeBtn = panel!.querySelector('[data-slot="dialog-close"]') as HTMLElement;
        expect(closeBtn!.className).toBe('test-close');
      });
    });
  });

  describe('Given a Dialog.Content with per-instance class', () => {
    describe('When rendered', () => {
      it('Then merges per-instance class with classes.content via space concatenation', () => {
        const triggerBtn = document.createElement('button');

        const root = ComposedDialog({
          children: () => {
            const triggerEl = ComposedDialog.Trigger({ children: [triggerBtn] });
            const contentEl = ComposedDialog.Content({
              children: [],
              class: 'max-w-md',
            });
            return [triggerEl, contentEl];
          },
          classes: { content: 'dialog-panel' },
        });

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(panel!.className).toBe('dialog-panel max-w-md');
      });
    });
  });

  describe('Given onOpenChange callback', () => {
    it('Then calls the callback when dialog opens and closes', () => {
      const onOpenChange = vi.fn();
      const triggerBtn = document.createElement('button');
      let closeEl!: HTMLElement;

      const root = ComposedDialog({
        children: () => {
          const triggerEl = ComposedDialog.Trigger({ children: [triggerBtn] });
          closeEl = ComposedDialog.Close({ children: ['Close'] });
          const contentEl = ComposedDialog.Content({ children: [closeEl] });
          return [triggerEl, contentEl];
        },
        onOpenChange,
      });
      container.appendChild(root);

      triggerBtn.click();
      expect(onOpenChange).toHaveBeenCalledWith(true);

      closeEl.click();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
