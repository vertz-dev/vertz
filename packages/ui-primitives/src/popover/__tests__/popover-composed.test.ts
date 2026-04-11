import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { ComposedPopover } from '../popover-composed';

describe('Composed Popover', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Popover with Trigger and Content sub-components', () => {
    describe('When rendered', () => {
      it('Then creates a wrapper with trigger and dialog content', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Open';

        const root = ComposedPopover({
          children: () => {
            const t = ComposedPopover.Trigger({ children: [btn] });
            const c = ComposedPopover.Content({ children: ['Popover body'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        expect(root.contains(btn)).toBe(true);
        const dialog = root.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
      });
    });

    describe('When the trigger is clicked', () => {
      it('Then opens the popover', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Open';

        const root = ComposedPopover({
          children: () => {
            const t = ComposedPopover.Trigger({ children: [btn] });
            const c = ComposedPopover.Content({ children: ['Body'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        btn.click();
        const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog!.getAttribute('data-state')).toBe('open');
      });
    });
  });

  describe('Given a Popover with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies content class to the dialog element', () => {
        const btn = document.createElement('button');
        const root = ComposedPopover({
          classes: { content: 'styled-content' },
          children: () => {
            const t = ComposedPopover.Trigger({ children: [btn] });
            const c = ComposedPopover.Content({ children: ['Body'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog!.className).toContain('styled-content');
      });
    });
  });

  describe('Given a Popover with onOpenChange', () => {
    it('Then calls the callback when state changes', () => {
      const changes: boolean[] = [];
      const btn = document.createElement('button');

      const root = ComposedPopover({
        onOpenChange: (open) => changes.push(open),
        children: () => {
          const t = ComposedPopover.Trigger({ children: [btn] });
          const c = ComposedPopover.Content({ children: ['Body'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();
      expect(changes).toEqual([true]);
    });
  });

  describe('Given a Popover trigger element', () => {
    it('Then sets ARIA attributes on the trigger wrapper', () => {
      const btn = document.createElement('button');

      const root = ComposedPopover({
        children: () => {
          const t = ComposedPopover.Trigger({ children: [btn] });
          const c = ComposedPopover.Content({ children: ['Body'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      // ARIA attributes are on the trigger wrapper span, not the user's button
      const triggerWrapper = root.querySelector('[data-popover-trigger]') as HTMLElement;
      expect(triggerWrapper.getAttribute('aria-haspopup')).toBe('dialog');
      expect(triggerWrapper.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Given an open Popover', () => {
    it('Then clicking trigger again closes the popover', () => {
      const btn = document.createElement('button');

      const root = ComposedPopover({
        children: () => {
          const t = ComposedPopover.Trigger({ children: [btn] });
          const c = ComposedPopover.Content({ children: ['Body'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Click the button — event bubbles to the trigger wrapper's onClick
      const triggerWrapper = root.querySelector('[data-popover-trigger]') as HTMLElement;
      btn.click();
      expect(triggerWrapper.getAttribute('data-state')).toBe('open');

      btn.click();
      expect(triggerWrapper.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given a Popover with positioning prop (#1334)', () => {
    it('Then forwards positioning to the primitive so floating-ui activates on open', () => {
      const btn = document.createElement('button');

      const root = ComposedPopover({
        positioning: { placement: 'bottom-start', portal: true },
        children: () => {
          const t = ComposedPopover.Trigger({ children: [btn] });
          const c = ComposedPopover.Content({ children: ['Body'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Open the popover
      btn.click();

      // When positioning with portal: true is active, content is moved to document.body
      const dialog = document.body.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog).not.toBeNull();
      expect(dialog!.parentElement).toBe(document.body);
    });
  });

  describe('Given a Popover.Trigger rendered outside Popover', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedPopover.Trigger({ children: ['Orphan'] });
        }).toThrow('<Popover.Trigger> must be used inside <Popover>');
      });
    });
  });

  describe('Given a Popover.Content rendered outside Popover', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedPopover.Content({ children: ['Orphan'] });
        }).toThrow('<Popover.Content> must be used inside <Popover>');
      });
    });
  });

  describe('Given a Popover with duplicate Content sub-components', () => {
    it('Then warns about the duplicate', () => {
      const spy = spyOn(console, 'warn').mockImplementation(() => {});
      const btn = document.createElement('button');

      ComposedPopover({
        children: () => {
          const t = ComposedPopover.Trigger({ children: [btn] });
          const c1 = ComposedPopover.Content({ children: ['Body 1'] });
          const c2 = ComposedPopover.Content({ children: ['Body 2'] });
          return [t, c1, c2];
        },
      });

      expect(spy).toHaveBeenCalledWith(
        'Duplicate <Popover.Content> detected – only the first is used',
      );
      spy.mockRestore();
    });
  });
});
