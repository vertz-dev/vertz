import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedSelect } from '../select-composed';

describe('Composed Select', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Select with Trigger, Content, and Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates a combobox trigger and listbox content', () => {
        const root = ComposedSelect({
          children: () => {
            const t = ComposedSelect.Trigger({ children: ['Pick one'] });
            const c = ComposedSelect.Content({
              children: () => {
                const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
                const i2 = ComposedSelect.Item({ value: 'b', children: ['Beta'] });
                return [i1, i2];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('[role="combobox"]') as HTMLElement;
        expect(trigger).not.toBeNull();
        expect(trigger!.getAttribute('aria-haspopup')).toBe('listbox');

        const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
        expect(listbox).not.toBeNull();

        const options = listbox!.querySelectorAll('[role="option"]');
        expect(options.length).toBe(2);
      });
    });

    describe('When the trigger is clicked', () => {
      it('Then opens the listbox', () => {
        const root = ComposedSelect({
          children: () => {
            const t = ComposedSelect.Trigger({ children: ['Pick one'] });
            const c = ComposedSelect.Content({
              children: () => {
                const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
                return [i1];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('[role="combobox"]') as HTMLElement;
        trigger!.click();
        expect(trigger!.getAttribute('aria-expanded')).toBe('true');
      });
    });
  });

  describe('Given a Select with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies trigger and content classes', () => {
        const root = ComposedSelect({
          classes: { trigger: 'styled-trigger', content: 'styled-content', item: 'styled-item' },
          children: () => {
            const t = ComposedSelect.Trigger({ children: ['Pick'] });
            const c = ComposedSelect.Content({
              children: () => {
                const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
                return [i1];
              },
            });
            return [t, c];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('[role="combobox"]') as HTMLElement;
        expect(trigger!.className).toContain('styled-trigger');

        const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
        expect(listbox!.className).toContain('styled-content');

        const option = listbox!.querySelector('[role="option"]') as HTMLElement;
        expect(option!.className).toContain('styled-item');
      });
    });
  });

  describe('Given a Select with an item clicked', () => {
    it('Then calls onValueChange', () => {
      const values: string[] = [];
      const root = ComposedSelect({
        onValueChange: (v) => values.push(v),
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c = ComposedSelect.Content({
            children: () => {
              const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
              return [i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Open the select
      const trigger = root.querySelector('[role="combobox"]') as HTMLElement;
      trigger!.click();

      // Click the item
      const option = root.querySelector('[role="option"]') as HTMLElement;
      option!.click();

      expect(values).toEqual(['a']);
    });
  });

  describe('Given a Select with positioning prop (#1334)', () => {
    it('Then forwards positioning to the primitive so floating-ui activates on open', () => {
      const root = ComposedSelect({
        positioning: { placement: 'bottom-start', portal: true },
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick one'] });
          const c = ComposedSelect.Content({
            children: () => {
              const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
              return [i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      // Open the select
      const trigger = root.querySelector('[role="combobox"]') as HTMLElement;
      trigger!.click();

      // When positioning with portal: true is active, content is moved to document.body
      const listbox = document.body.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox).not.toBeNull();
      expect(listbox!.parentElement).toBe(document.body);
    });
  });

  describe('Given a Select with items', () => {
    it('Then each item contains an indicator element with data-part="indicator"', () => {
      const root = ComposedSelect({
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c = ComposedSelect.Content({
            children: () => {
              const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
              return [i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const option = root.querySelector('[role="option"]') as HTMLElement;
      const indicator = option!.querySelector('[data-part="indicator"]');
      expect(indicator).not.toBeNull();
    });

    it('Then applies itemIndicator class to the indicator element', () => {
      const root = ComposedSelect({
        classes: { itemIndicator: 'check-indicator' },
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c = ComposedSelect.Content({
            children: () => {
              const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
              return [i1];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const indicator = root.querySelector('[data-part="indicator"]') as HTMLElement;
      expect(indicator!.className).toContain('check-indicator');
    });
  });

  describe('Given a Select trigger', () => {
    it('Then the trigger contains a chevron element with data-part="chevron"', () => {
      const root = ComposedSelect({
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c = ComposedSelect.Content({
            children: () => [ComposedSelect.Item({ value: 'a', children: ['A'] })],
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const trigger = root.querySelector('[role="combobox"]') as HTMLElement;
      const chevron = trigger!.querySelector('[data-part="chevron"]');
      expect(chevron).not.toBeNull();
    });
  });

  describe('Given a Select.Trigger rendered outside Select', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedSelect.Trigger({ children: ['Orphan'] });
        }).toThrow('<Select.Trigger> must be used inside <Select>');
      });
    });
  });

  describe('Given a Select.Content rendered outside Select', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedSelect.Content({ children: ['Orphan'] });
        }).toThrow('<Select.Content> must be used inside <Select>');
      });
    });
  });

  describe('Given a Select with duplicate Content sub-components', () => {
    it('Then warns about the duplicate', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      ComposedSelect({
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c1 = ComposedSelect.Content({
            children: () => [ComposedSelect.Item({ value: 'a', children: ['A'] })],
          });
          const c2 = ComposedSelect.Content({
            children: () => [ComposedSelect.Item({ value: 'b', children: ['B'] })],
          });
          return [t, c1, c2];
        },
      });

      expect(spy).toHaveBeenCalledWith(
        'Duplicate <Select.Content> detected – only the first is used',
      );
      spy.mockRestore();
    });
  });

  describe('Given a Select with groups', () => {
    it('Then creates groups with items', () => {
      const root = ComposedSelect({
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c = ComposedSelect.Content({
            children: () => {
              const g = ComposedSelect.Group({
                label: 'Fruits',
                children: () => {
                  const i1 = ComposedSelect.Item({ value: 'apple', children: ['Apple'] });
                  return [i1];
                },
              });
              return [g];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const group = root.querySelector('[role="group"]') as HTMLElement;
      expect(group).not.toBeNull();
      expect(group!.getAttribute('aria-label')).toBe('Fruits');

      const option = group!.querySelector('[role="option"]') as HTMLElement;
      expect(option).not.toBeNull();
    });
  });

  describe('Given a Select with separator', () => {
    it('Then creates a separator element', () => {
      const root = ComposedSelect({
        children: () => {
          const t = ComposedSelect.Trigger({ children: ['Pick'] });
          const c = ComposedSelect.Content({
            children: () => {
              const i1 = ComposedSelect.Item({ value: 'a', children: ['Alpha'] });
              const sep = ComposedSelect.Separator({});
              const i2 = ComposedSelect.Item({ value: 'b', children: ['Beta'] });
              return [i1, sep, i2];
            },
          });
          return [t, c];
        },
      });
      container.appendChild(root);

      const separator = root.querySelector('[role="separator"]') as HTMLElement;
      expect(separator).not.toBeNull();
    });
  });
});
