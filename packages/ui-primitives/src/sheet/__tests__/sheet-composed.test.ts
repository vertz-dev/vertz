import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { popScope, pushScope, runCleanups } from '@vertz/ui/internals';
import { ComposedSheet } from '../sheet-composed';

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
    describe('When rendered', () => {
      it('Then creates a wrapper with trigger, overlay, and dialog content', () => {
        const btn = document.createElement('button');
        btn.textContent = 'Open Sheet';

        const root = ComposedSheet({
          children: () => {
            const t = ComposedSheet.Trigger({ children: [btn] });
            const c = ComposedSheet.Content({ children: ['Sheet body'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        expect(root.contains(btn)).toBe(true);
        const dialog = root.querySelector('[role="dialog"]');
        expect(dialog).not.toBeNull();
        const overlay = root.querySelector('[data-sheet-overlay]');
        expect(overlay).not.toBeNull();
      });
    });

    describe('When the trigger is clicked', () => {
      it('Then opens the sheet', () => {
        const btn = document.createElement('button');

        const root = ComposedSheet({
          children: () => {
            const t = ComposedSheet.Trigger({ children: [btn] });
            const c = ComposedSheet.Content({ children: ['Body'] });
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

  describe('Given a Sheet with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies overlay and content classes', () => {
        const btn = document.createElement('button');

        const root = ComposedSheet({
          classes: { overlay: 'styled-overlay', content: 'styled-content' },
          children: () => {
            const t = ComposedSheet.Trigger({ children: [btn] });
            const c = ComposedSheet.Content({ children: ['Body'] });
            return [t, c];
          },
        });
        container.appendChild(root);

        const overlay = root.querySelector('[data-sheet-overlay]') as HTMLElement;
        expect(overlay!.className).toContain('styled-overlay');

        const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
        expect(dialog!.className).toContain('styled-content');
      });
    });
  });

  describe('Given a Sheet with side prop', () => {
    it('Then sets data-side on the content element', () => {
      const btn = document.createElement('button');

      const root = ComposedSheet({
        side: 'left',
        children: () => {
          const t = ComposedSheet.Trigger({ children: [btn] });
          const c = ComposedSheet.Content({ children: ['Body'] });
          return [t, c];
        },
      });
      container.appendChild(root);

      const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog!.getAttribute('data-side')).toBe('left');
    });
  });

  describe('Given a Sheet with Title and Description sub-components', () => {
    it('Then renders title and description elements with classes', () => {
      const btn = document.createElement('button');

      const root = ComposedSheet({
        classes: { title: 'styled-title', description: 'styled-desc' },
        children: () => {
          const t = ComposedSheet.Trigger({ children: [btn] });
          const c = ComposedSheet.Content({
            children: () => {
              const title = ComposedSheet.Title({ children: ['Sheet Title'] });
              const desc = ComposedSheet.Description({ children: ['Sheet Description'] });
              return [title, desc];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();
      const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
      const title = dialog!.querySelector('h2') as HTMLElement;
      expect(title!.textContent).toBe('Sheet Title');
      expect(title!.className).toContain('styled-title');

      const desc = dialog!.querySelector('p') as HTMLElement;
      expect(desc!.textContent).toBe('Sheet Description');
      expect(desc!.className).toContain('styled-desc');
    });
  });

  describe('Given a Sheet with Close sub-component', () => {
    it('Then clicking close hides the sheet', () => {
      const btn = document.createElement('button');
      let closeEl!: HTMLElement;

      const root = ComposedSheet({
        children: () => {
          const t = ComposedSheet.Trigger({ children: [btn] });
          const c = ComposedSheet.Content({
            children: () => {
              closeEl = ComposedSheet.Close({ children: ['Close'] });
              return [closeEl];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      btn.click();
      const dialog = root.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog!.getAttribute('data-state')).toBe('open');

      closeEl.click();
      expect(dialog!.getAttribute('data-state')).toBe('closed');
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

  describe('Given a Sheet rendered inside a disposal scope', () => {
    describe('When the disposal scope cleanups are run', () => {
      it('Then removeEventListener is called for the trigger click handler', () => {
        const scope = pushScope();
        const btn = document.createElement('button');

        const root = ComposedSheet({
          children: () => {
            const t = ComposedSheet.Trigger({ children: [btn] });
            const c = ComposedSheet.Content({ children: ['Body'] });
            return [t, c];
          },
        });
        container.appendChild(root);
        popScope();

        const spy = vi.spyOn(btn, 'removeEventListener');
        runCleanups(scope);

        expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
      });

      it('Then removeEventListener is called for the content delegation handler', () => {
        const scope = pushScope();
        const btn = document.createElement('button');

        const root = ComposedSheet({
          children: () => {
            const t = ComposedSheet.Trigger({ children: [btn] });
            const c = ComposedSheet.Content({ children: ['Body'] });
            return [t, c];
          },
        });
        container.appendChild(root);
        popScope();

        const panel = root.querySelector('[role="dialog"]') as HTMLElement;
        const spy = vi.spyOn(panel, 'removeEventListener');
        runCleanups(scope);

        expect(spy).toHaveBeenCalledWith('click', expect.any(Function));
      });
    });
  });
});
