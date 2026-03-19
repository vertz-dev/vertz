import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { ComposedAccordion } from '../accordion-composed';

describe('Composed Accordion', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given an Accordion with Item, Trigger, and Content sub-components', () => {
    describe('When rendered', () => {
      it('Then creates accordion items with triggers and content regions', () => {
        const root = ComposedAccordion({
          children: () => {
            const item1 = ComposedAccordion.Item({
              value: 'item1',
              children: () => {
                const trigger = ComposedAccordion.Trigger({ children: ['Section 1'] });
                const content = ComposedAccordion.Content({ children: ['Content 1'] });
                return [trigger, content];
              },
            });
            const item2 = ComposedAccordion.Item({
              value: 'item2',
              children: () => {
                const trigger = ComposedAccordion.Trigger({ children: ['Section 2'] });
                const content = ComposedAccordion.Content({ children: ['Content 2'] });
                return [trigger, content];
              },
            });
            return [item1, item2];
          },
        });
        container.appendChild(root);

        const triggers = root.querySelectorAll('button[aria-expanded]');
        expect(triggers.length).toBe(2);

        const regions = root.querySelectorAll('[role="region"]');
        expect(regions.length).toBe(2);
      });
    });

    describe('When a trigger is clicked', () => {
      it('Then expands the corresponding content', () => {
        const root = ComposedAccordion({
          children: () => {
            const item1 = ComposedAccordion.Item({
              value: 'item1',
              children: () => {
                const trigger = ComposedAccordion.Trigger({ children: ['Section 1'] });
                const content = ComposedAccordion.Content({ children: ['Content 1'] });
                return [trigger, content];
              },
            });
            return [item1];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('button') as HTMLElement;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        trigger.click();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
      });
    });
  });

  describe('Given an Accordion with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to item, trigger, and content', () => {
        const root = ComposedAccordion({
          classes: { item: 'styled-item', trigger: 'styled-trigger', content: 'styled-content' },
          children: () => {
            const item1 = ComposedAccordion.Item({
              value: 'item1',
              children: () => {
                const trigger = ComposedAccordion.Trigger({ children: ['S1'] });
                const content = ComposedAccordion.Content({ children: ['C1'] });
                return [trigger, content];
              },
            });
            return [item1];
          },
        });
        container.appendChild(root);

        const itemEl = root.querySelector('[data-value="item1"]') as HTMLElement;
        expect(itemEl!.className).toBe('styled-item');

        const trigger = root.querySelector('button') as HTMLElement;
        expect(trigger!.className).toBe('styled-trigger');

        const region = root.querySelector('[role="region"]') as HTMLElement;
        expect(region!.className).toBe('styled-content');
      });
    });
  });

  describe('Given an Accordion with defaultValue', () => {
    it('Then opens the specified items initially', () => {
      const root = ComposedAccordion({
        defaultValue: ['item2'],
        children: () => {
          const item1 = ComposedAccordion.Item({
            value: 'item1',
            children: () => {
              const trigger = ComposedAccordion.Trigger({ children: ['S1'] });
              const content = ComposedAccordion.Content({ children: ['C1'] });
              return [trigger, content];
            },
          });
          const item2 = ComposedAccordion.Item({
            value: 'item2',
            children: () => {
              const trigger = ComposedAccordion.Trigger({ children: ['S2'] });
              const content = ComposedAccordion.Content({ children: ['C2'] });
              return [trigger, content];
            },
          });
          return [item1, item2];
        },
      });
      container.appendChild(root);

      const triggers = root.querySelectorAll('button');
      expect(triggers[0]!.getAttribute('aria-expanded')).toBe('false');
      expect(triggers[1]!.getAttribute('aria-expanded')).toBe('true');
    });
  });

  describe('Given an Accordion.Item rendered outside Accordion', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedAccordion.Item({ value: 'orphan', children: ['Orphan'] });
        }).toThrow('<Accordion.Item> must be used inside <Accordion>');
      });
    });
  });

  describe('Given an Accordion.Trigger rendered outside Accordion.Item', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedAccordion.Trigger({ children: ['Orphan'] });
        }).toThrow('<Accordion.Trigger> must be used inside <Accordion.Item>');
      });
    });
  });

  describe('Given an Accordion.Content rendered outside Accordion.Item', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedAccordion.Content({ children: ['Orphan'] });
        }).toThrow('<Accordion.Content> must be used inside <Accordion.Item>');
      });
    });
  });

  describe('Given an Accordion item that is toggled open', () => {
    it('Then sets --accordion-content-height on the content element', () => {
      const root = ComposedAccordion({
        children: () => {
          const item1 = ComposedAccordion.Item({
            value: 'item1',
            children: () => {
              const trigger = ComposedAccordion.Trigger({ children: ['S1'] });
              const content = ComposedAccordion.Content({ children: ['Content 1'] });
              return [trigger, content];
            },
          });
          return [item1];
        },
      });
      container.appendChild(root);

      const trigger = root.querySelector('button') as HTMLElement;
      trigger.click();

      const content = root.querySelector('[role="region"]') as HTMLElement;
      const heightVar = content.style.getPropertyValue('--accordion-content-height');
      expect(heightVar).not.toBe('');
    });

    it('Then sets data-state and aria-hidden correctly when closing', () => {
      const root = ComposedAccordion({
        defaultValue: ['item1'],
        children: () => {
          const item1 = ComposedAccordion.Item({
            value: 'item1',
            children: () => {
              const trigger = ComposedAccordion.Trigger({ children: ['S1'] });
              const content = ComposedAccordion.Content({ children: ['Content 1'] });
              return [trigger, content];
            },
          });
          return [item1];
        },
      });
      container.appendChild(root);

      const trigger = root.querySelector('button') as HTMLElement;
      let content = root.querySelector('[role="region"]') as HTMLElement;
      expect(content.getAttribute('data-state')).toBe('open');
      expect(content.getAttribute('aria-hidden')).toBe('false');

      // Close the item — uses setHiddenAnimated which defers display:none until animation ends.
      // Re-query the content element after click because the reactive system may
      // replace the DOM element during signal propagation.
      trigger.click();
      content = root.querySelector('[role="region"]') as HTMLElement;

      expect(content.getAttribute('data-state')).toBe('closed');
      expect(content.getAttribute('aria-hidden')).toBe('true');
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(trigger.getAttribute('data-state')).toBe('closed');
    });
  });

  describe('Given Accordion trigger text from children', () => {
    it('Then moves children into the primitive trigger button', () => {
      const root = ComposedAccordion({
        children: () => {
          const item1 = ComposedAccordion.Item({
            value: 'item1',
            children: () => {
              const trigger = ComposedAccordion.Trigger({ children: ['Custom Text'] });
              const content = ComposedAccordion.Content({ children: ['Content'] });
              return [trigger, content];
            },
          });
          return [item1];
        },
      });
      container.appendChild(root);

      const trigger = root.querySelector('button') as HTMLElement;
      expect(trigger!.textContent).toBe('Custom Text');
    });
  });
});
