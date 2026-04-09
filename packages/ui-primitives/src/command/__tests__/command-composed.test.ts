import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';

describe('Composed Command', () => {
  let container: HTMLDivElement;
  let ComposedCommand: typeof import('../command-composed').ComposedCommand;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    ({ ComposedCommand } = await import('../command-composed'));
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Command with Input, List, and Item sub-components', () => {
    describe('When rendered', () => {
      it('Then creates input, list, and items', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'calendar',
                  children: ['Calendar'],
                });
                const i2 = ComposedCommand.Item({
                  value: 'search',
                  children: ['Search'],
                });
                return [i1, i2];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]');
        expect(input).not.toBeNull();

        const listbox = root.querySelector('[role="listbox"]');
        expect(listbox).not.toBeNull();

        const items = root.querySelectorAll('[role="option"]');
        expect(items.length).toBe(2);
      });
    });
  });

  describe('Given a Command with classes prop', () => {
    describe('When rendered', () => {
      it('Then applies classes to root, input, list, and items', () => {
        const root = ComposedCommand({
          classes: {
            root: 'styled-root',
            input: 'styled-input',
            list: 'styled-list',
            item: 'styled-item',
          },
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'a',
                  children: ['A'],
                });
                return [i1];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        expect(root.className).toContain('styled-root');

        const input = root.querySelector('[role="combobox"]') as HTMLElement;
        expect(input.className).toContain('styled-input');

        const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
        expect(listbox.className).toContain('styled-list');

        const item = root.querySelector('[role="option"]') as HTMLElement;
        expect(item.className).toContain('styled-item');
      });
    });
  });

  describe('Given a Command with a placeholder', () => {
    describe('When rendered', () => {
      it('Then the input has the placeholder attribute', () => {
        const root = ComposedCommand({
          placeholder: 'Type a command...',
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({ children: [] });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
        expect(input.getAttribute('placeholder')).toBe('Type a command...');
      });
    });
  });

  describe('Given a Command with items and a search input', () => {
    describe('When the user types a filter that matches some items', () => {
      it('Then non-matching items are hidden', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'calendar',
                  children: ['Calendar'],
                });
                const i2 = ComposedCommand.Item({
                  value: 'search',
                  children: ['Search'],
                });
                const i3 = ComposedCommand.Item({
                  value: 'settings',
                  children: ['Settings'],
                });
                return [i1, i2, i3];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
        input.value = 'cal';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const items = root.querySelectorAll('[role="option"]');
        const visibleItems = Array.from(items).filter(
          (item) => item.getAttribute('aria-hidden') !== 'true',
        );
        expect(visibleItems.length).toBe(1);
        expect(visibleItems[0]?.getAttribute('data-value')).toBe('calendar');
      });
    });
  });

  describe('Given a Command with an Empty sub-component', () => {
    describe('When rendered with items present', () => {
      it('Then the empty element is visually hidden (display: none)', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const empty = ComposedCommand.Empty({
                  children: ['No results found.'],
                });
                const i1 = ComposedCommand.Item({
                  value: 'calendar',
                  children: ['Calendar'],
                });
                return [empty, i1];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const empty = root.querySelector('[data-part="command-empty"]') as HTMLElement;
        expect(empty.getAttribute('aria-hidden')).toBe('true');
        expect(empty.style.display).toBe('none');
      });
    });

    describe('When all items are filtered out', () => {
      it('Then the empty element is shown', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const empty = ComposedCommand.Empty({
                  children: ['No results found.'],
                });
                const i1 = ComposedCommand.Item({
                  value: 'calendar',
                  children: ['Calendar'],
                });
                return [empty, i1];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        // Empty should be hidden initially (items are visible)
        const empty = root.querySelector('[data-part="command-empty"]') as HTMLElement;
        expect(empty.getAttribute('aria-hidden')).toBe('true');

        // Filter to match nothing
        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
        input.value = 'zzz';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        expect(empty.getAttribute('aria-hidden')).toBe('false');
        expect(empty.style.display).not.toBe('none');
      });
    });
  });

  describe('Given a Command with Group sub-component', () => {
    describe('When rendered', () => {
      it('Then creates a group with label and items', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const group = ComposedCommand.Group({
                  label: 'Suggestions',
                  children: () => {
                    const i1 = ComposedCommand.Item({
                      value: 'calendar',
                      children: ['Calendar'],
                    });
                    return [i1];
                  },
                });
                return [group];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const group = root.querySelector('[role="group"]') as HTMLElement;
        expect(group).not.toBeNull();

        const labelId = group.getAttribute('aria-labelledby');
        expect(labelId).not.toBeNull();

        const heading = group.querySelector(`#${labelId}`) as HTMLElement;
        expect(heading).not.toBeNull();
        expect(heading.textContent).toBe('Suggestions');
      });
    });
  });

  describe('Given a Command with Separator sub-component', () => {
    describe('When rendered', () => {
      it('Then creates a separator element', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'a',
                  children: ['A'],
                });
                const sep = ComposedCommand.Separator({});
                const i2 = ComposedCommand.Item({
                  value: 'b',
                  children: ['B'],
                });
                return [i1, sep, i2];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const separator = root.querySelector('[role="separator"]');
        expect(separator).not.toBeNull();
      });
    });
  });

  describe('Given a Command with onSelect callback', () => {
    describe('When an item is clicked', () => {
      it('Then fires onSelect with the item value', () => {
        const selected: string[] = [];

        const root = ComposedCommand({
          onSelect: (value) => selected.push(value),
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'edit',
                  children: ['Edit'],
                });
                return [i1];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const item = root.querySelector('[data-value="edit"]') as HTMLElement;
        item.click();
        expect(selected).toEqual(['edit']);
      });
    });
  });

  describe('Given a Command with keyboard navigation', () => {
    describe('When ArrowDown is pressed', () => {
      it('Then the next item becomes active', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'a',
                  children: ['A'],
                });
                const i2 = ComposedCommand.Item({
                  value: 'b',
                  children: ['B'],
                });
                return [i1, i2];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;

        // First item should be active by default
        const items = root.querySelectorAll('[role="option"]');
        expect(items[0]?.getAttribute('aria-selected')).toBe('true');

        // Arrow down to second item
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        expect(items[1]?.getAttribute('aria-selected')).toBe('true');
        expect(items[0]?.getAttribute('aria-selected')).toBe('false');
      });
    });

    describe('When Enter is pressed on an active item', () => {
      it('Then fires onSelect with the active item value', () => {
        const selected: string[] = [];

        const root = ComposedCommand({
          onSelect: (value) => selected.push(value),
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'first',
                  children: ['First'],
                });
                return [i1];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(selected).toEqual(['first']);
      });
    });

    describe('When Escape is pressed', () => {
      it('Then clears the input value', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const i1 = ComposedCommand.Item({
                  value: 'a',
                  children: ['A'],
                });
                return [i1];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(input.value).toBe('');
      });
    });
  });

  describe('Given a Command.Item rendered outside Command', () => {
    describe('When the component mounts', () => {
      it('Then throws an error', () => {
        expect(() => {
          ComposedCommand.Item({ value: 'orphan', children: ['Orphan'] });
        }).toThrow('<Command.Item> must be used inside <Command>');
      });
    });
  });

  describe('Given a Command with groups and filtering', () => {
    describe('When all items in a group are filtered out', () => {
      it('Then the group is hidden', () => {
        const root = ComposedCommand({
          children: () => {
            const input = ComposedCommand.Input({});
            const list = ComposedCommand.List({
              children: () => {
                const g1 = ComposedCommand.Group({
                  label: 'Fruits',
                  children: () => [ComposedCommand.Item({ value: 'apple', children: ['Apple'] })],
                });
                const g2 = ComposedCommand.Group({
                  label: 'Veggies',
                  children: () => [ComposedCommand.Item({ value: 'carrot', children: ['Carrot'] })],
                });
                return [g1, g2];
              },
            });
            return [input, list];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
        input.value = 'apple';
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const groups = root.querySelectorAll('[role="group"]');
        // Fruits group should be visible
        expect((groups[0] as HTMLElement).style.display).not.toBe('none');
        // Veggies group should be hidden (no matching items)
        expect((groups[1] as HTMLElement).style.display).toBe('none');
      });
    });
  });
});
