import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { ComposedSheet } from '../sheet-composed';

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 20));
}

function getConnectedPanel(root: HTMLElement) {
  const renderedPanel = root.querySelector('dialog') as HTMLDialogElement;
  return document.getElementById(renderedPanel.id) as HTMLDialogElement;
}

function createSheetTree(
  classes?: Record<string, string>,
  options?: {
    side?: 'left' | 'right' | 'top' | 'bottom';
    showClose?: boolean;
    onOpenChange?: (open: boolean) => void;
  },
) {
  const triggerBtn = document.createElement('button');
  triggerBtn.textContent = 'Open';

  let closeEl!: HTMLElement;

  const root = ComposedSheet({
    classes,
    side: options?.side,
    onOpenChange: options?.onOpenChange,
    children: () => {
      const triggerEl = ComposedSheet.Trigger({ children: [triggerBtn] });
      const titleEl = ComposedSheet.Title({ children: ['Sheet Title'] });
      const descriptionEl = ComposedSheet.Description({ children: ['Sheet Description'] });
      closeEl = ComposedSheet.Close({ children: ['Close'] });
      const contentEl = ComposedSheet.Content({
        showClose: options?.showClose,
        children: [titleEl, descriptionEl, closeEl],
      });
      return [triggerEl, contentEl];
    },
  });

  return { root, triggerBtn, closeEl };
}

describe('Composed Sheet', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Sheet with Trigger and Content sub-components', () => {
    describe('When the trigger is clicked', () => {
      it('Then opens the native dialog sheet', () => {
        const { root, triggerBtn } = createSheetTree();
        container.appendChild(root);

        triggerBtn.click();

        const panel = getConnectedPanel(root);
        expect(panel).not.toBeNull();
        expect(panel.getAttribute('data-state')).toBe('open');
      });

      it('Then sets data-side on the content element', () => {
        const { root, triggerBtn } = createSheetTree(undefined, { side: 'left' });
        container.appendChild(root);

        triggerBtn.click();

        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-side')).toBe('left');
      });

      it('Then sets aria-labelledby pointing to the title', () => {
        const { root } = createSheetTree();
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        const labelledBy = panel.getAttribute('aria-labelledby');
        expect(labelledBy).toBeTruthy();
        expect(root.querySelector(`#${labelledBy}`)?.textContent).toBe('Sheet Title');
      });

      it('Then sets aria-describedby pointing to the description', () => {
        const { root } = createSheetTree();
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        const describedBy = panel.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(root.querySelector(`#${describedBy}`)?.textContent).toBe('Sheet Description');
      });
    });

    describe('When Escape is pressed while the sheet is open', () => {
      it('Then closes the sheet', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn } = createSheetTree(undefined, { onOpenChange });
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
      it('Then closes the sheet', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn } = createSheetTree(undefined, { onOpenChange });
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.getAttribute('data-state')).toBe('open');

        panel.click();
        await flush();

        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    describe('When Sheet.Close is clicked', () => {
      it('Then closes the sheet', async () => {
        const onOpenChange = vi.fn();
        const { root, triggerBtn, closeEl } = createSheetTree(undefined, { onOpenChange });
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

  describe('Given a Sheet with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies content, title, description, and close classes', () => {
        const { root } = createSheetTree({
          content: 'test-content',
          title: 'test-title',
          description: 'test-description',
          close: 'test-close',
        });
        container.appendChild(root);

        const panel = getConnectedPanel(root);
        expect(panel.className).toContain('test-content');
        expect(panel.querySelector('h2')?.className).toBe('test-title');
        expect(panel.querySelector('p')?.className).toBe('test-description');
        expect(panel.querySelector('[data-slot="sheet-close"]')?.className).toContain('test-close');
      });
    });
  });

  describe('Given a Sheet.Content with per-instance class', () => {
    describe('When rendered', () => {
      it('Then merges per-instance class with classes.content via space concatenation', () => {
        const triggerBtn = document.createElement('button');

        const root = ComposedSheet({
          classes: { content: 'sheet-panel' },
          children: () => {
            const triggerEl = ComposedSheet.Trigger({ children: [triggerBtn] });
            const contentEl = ComposedSheet.Content({
              class: 'max-w-md',
              children: [],
            });
            return [triggerEl, contentEl];
          },
        });

        const panel = root.querySelector('dialog') as HTMLDialogElement;
        expect(panel.className).toBe('sheet-panel max-w-md');
      });
    });
  });

  describe('Given a Sheet.Content with showClose disabled', () => {
    it('Then does not render the default close icon button', () => {
      const { root } = createSheetTree(undefined, { showClose: false });
      container.appendChild(root);

      const iconClose = getConnectedPanel(root).querySelector('button[aria-label="Close"]');
      expect(iconClose).toBeNull();
    });
  });

  describe('Given onOpenChange callback', () => {
    it('Then calls the callback when the sheet opens and closes', async () => {
      const onOpenChange = vi.fn();
      const triggerBtn = document.createElement('button');
      let closeEl!: HTMLElement;

      const root = ComposedSheet({
        onOpenChange,
        children: () => {
          const triggerEl = ComposedSheet.Trigger({ children: [triggerBtn] });
          closeEl = ComposedSheet.Close({ children: ['Close'] });
          const contentEl = ComposedSheet.Content({ children: [closeEl] });
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

  describe('Given an open Sheet', () => {
    describe('When close is triggered via Close button', () => {
      it('Then sets data-state to closed but defers dialog.close() for animation', () => {
        const { root, triggerBtn, closeEl } = createSheetTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.open).toBe(true);

        const closeSpy = vi.spyOn(panel, 'close');

        closeEl.click();

        expect(panel.getAttribute('data-state')).toBe('closed');
        expect(closeSpy).not.toHaveBeenCalled();

        panel.dispatchEvent(new Event('animationend'));
        expect(closeSpy).toHaveBeenCalled();
      });
    });

    describe('When close is triggered via Escape key', () => {
      it('Then prevents native close and defers dialog.close() for animation', () => {
        const { root, triggerBtn } = createSheetTree();
        container.appendChild(root);

        triggerBtn.click();
        const panel = getConnectedPanel(root);
        expect(panel.open).toBe(true);

        const closeSpy = vi.spyOn(panel, 'close');
        const cancelEvent = new Event('cancel', { bubbles: true, cancelable: true });
        panel.dispatchEvent(cancelEvent);

        expect(cancelEvent.defaultPrevented).toBe(true);
        expect(panel.getAttribute('data-state')).toBe('closed');
        expect(closeSpy).not.toHaveBeenCalled();

        panel.dispatchEvent(new Event('animationend'));
        expect(closeSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Given a Sheet.Trigger rendered outside Sheet', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedSheet.Trigger({ children: ['Orphan'] });
        }).toThrow('<Sheet.Trigger> must be used inside <Sheet>');
      });
    });
  });

  describe('Given a Sheet.Content rendered outside Sheet', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedSheet.Content({ children: ['Orphan'] });
        }).toThrow('<Sheet.Content> must be used inside <Sheet>');
      });
    });
  });
});
