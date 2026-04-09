import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { ComposedTabs } from '../tabs-composed';

describe('Composed Tabs', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Tabs with List, Trigger, and Content sub-components', () => {
    describe('When rendered with default value', () => {
      it('Then renders with role="tablist" and role="tabpanel"', () => {
        const root = ComposedTabs({
          defaultValue: 'tab1',
          children: () => {
            const list = ComposedTabs.List({
              children: () => {
                const t1 = ComposedTabs.Trigger({ value: 'tab1', children: ['Tab 1'] });
                const t2 = ComposedTabs.Trigger({ value: 'tab2', children: ['Tab 2'] });
                return [t1, t2];
              },
            });
            const c1 = ComposedTabs.Content({ value: 'tab1', children: ['Content 1'] });
            const c2 = ComposedTabs.Content({ value: 'tab2', children: ['Content 2'] });
            return [list, c1, c2];
          },
        });
        container.appendChild(root);

        const tablist = root.querySelector('[role="tablist"]');
        expect(tablist).not.toBeNull();

        const triggers = root.querySelectorAll('[role="tab"]');
        expect(triggers.length).toBe(2);

        const panels = root.querySelectorAll('[role="tabpanel"]');
        expect(panels.length).toBe(2);
      });
    });

    describe('When a trigger is clicked', () => {
      it('Then switches the active tab panel', () => {
        const root = ComposedTabs({
          defaultValue: 'tab1',
          children: () => {
            const list = ComposedTabs.List({
              children: () => {
                const t1 = ComposedTabs.Trigger({ value: 'tab1', children: ['Tab 1'] });
                const t2 = ComposedTabs.Trigger({ value: 'tab2', children: ['Tab 2'] });
                return [t1, t2];
              },
            });
            const c1 = ComposedTabs.Content({ value: 'tab1', children: ['Content 1'] });
            const c2 = ComposedTabs.Content({ value: 'tab2', children: ['Content 2'] });
            return [list, c1, c2];
          },
        });
        container.appendChild(root);

        const triggers = root.querySelectorAll('[role="tab"]');
        const panels = root.querySelectorAll('[role="tabpanel"]');

        // Initially tab1 is active
        expect(panels[0]!.getAttribute('aria-hidden')).toBe('false');
        expect(panels[1]!.getAttribute('aria-hidden')).toBe('true');

        // Click tab2
        (triggers[1] as HTMLElement).click();
        expect(panels[0]!.getAttribute('aria-hidden')).toBe('true');
        expect(panels[1]!.getAttribute('aria-hidden')).toBe('false');
      });
    });
  });

  describe('Given a Tabs with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to list, triggers, and panels', () => {
        const root = ComposedTabs({
          defaultValue: 'tab1',
          classes: { list: 'styled-list', trigger: 'styled-trigger', panel: 'styled-panel' },
          children: () => {
            const list = ComposedTabs.List({
              children: () => {
                const t1 = ComposedTabs.Trigger({ value: 'tab1', children: ['Tab 1'] });
                return [t1];
              },
            });
            const c1 = ComposedTabs.Content({ value: 'tab1', children: ['Content 1'] });
            return [list, c1];
          },
        });
        container.appendChild(root);

        const tablist = root.querySelector('[role="tablist"]') as HTMLElement;
        expect(tablist!.className).toBe('styled-list');

        const trigger = root.querySelector('[role="tab"]') as HTMLElement;
        expect(trigger!.className).toBe('styled-trigger');

        const panel = root.querySelector('[role="tabpanel"]') as HTMLElement;
        expect(panel!.className).toBe('styled-panel');
      });
    });
  });

  describe('Given a Tabs with onValueChange callback', () => {
    it('Then calls the callback when tabs change', () => {
      const values: string[] = [];
      const root = ComposedTabs({
        defaultValue: 'tab1',
        onValueChange: (v) => values.push(v),
        children: () => {
          const list = ComposedTabs.List({
            children: () => {
              const t1 = ComposedTabs.Trigger({ value: 'tab1', children: ['Tab 1'] });
              const t2 = ComposedTabs.Trigger({ value: 'tab2', children: ['Tab 2'] });
              return [t1, t2];
            },
          });
          const c1 = ComposedTabs.Content({ value: 'tab1', children: ['C1'] });
          const c2 = ComposedTabs.Content({ value: 'tab2', children: ['C2'] });
          return [list, c1, c2];
        },
      });
      container.appendChild(root);

      const triggers = root.querySelectorAll('[role="tab"]');
      (triggers[1] as HTMLElement).click();
      expect(values).toEqual(['tab2']);
    });
  });

  describe('Given a Tabs.List rendered outside Tabs', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedTabs.List({ children: ['Orphan'] });
        }).toThrow('<Tabs.List> must be used inside <Tabs>');
      });
    });
  });

  describe('Given a Tabs.Trigger rendered outside Tabs', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedTabs.Trigger({ value: 'orphan', children: ['Orphan'] });
        }).toThrow('<Tabs.Trigger> must be used inside <Tabs>');
      });
    });
  });

  describe('Given a Tabs.Content rendered outside Tabs', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedTabs.Content({ value: 'orphan', children: ['Orphan'] });
        }).toThrow('<Tabs.Content> must be used inside <Tabs>');
      });
    });
  });

  describe('Given Tabs trigger children', () => {
    describe('When rendered', () => {
      it('Then trigger text comes from children, not value', () => {
        const root = ComposedTabs({
          defaultValue: 'tab1',
          children: () => {
            const list = ComposedTabs.List({
              children: () => {
                return [ComposedTabs.Trigger({ value: 'tab1', children: ['Custom Label'] })];
              },
            });
            const c1 = ComposedTabs.Content({ value: 'tab1', children: ['Content'] });
            return [list, c1];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('[role="tab"]') as HTMLElement;
        expect(trigger!.textContent).toBe('Custom Label');
      });
    });
  });
});
