import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';

describe('Composed Combobox', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Given a Combobox with Input, Content, and Option sub-components', () => {
    describe('When rendered', () => {
      it('Then the input has role="combobox", aria-autocomplete="list", and aria-haspopup="listbox"', async () => {
        const { ComposedCombobox } = await import('../combobox-composed');

        const root = ComposedCombobox({
          children: () => {
            const inp = ComposedCombobox.Input({});
            const content = ComposedCombobox.Content({
              children: () => {
                const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
                const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
                return [o1, o2];
              },
            });
            return [inp, content];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLElement;
        expect(input).not.toBeNull();
        expect(input?.getAttribute('aria-autocomplete')).toBe('list');
        expect(input?.getAttribute('aria-haspopup')).toBe('listbox');
      });

      it('Then the content has role="listbox"', async () => {
        const { ComposedCombobox } = await import('../combobox-composed');

        const root = ComposedCombobox({
          children: () => {
            const inp = ComposedCombobox.Input({});
            const content = ComposedCombobox.Content({
              children: () => {
                const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
                return [o1];
              },
            });
            return [inp, content];
          },
        });
        container.appendChild(root);

        const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
        expect(listbox).not.toBeNull();
      });

      it('Then input aria-controls points to content id', async () => {
        const { ComposedCombobox } = await import('../combobox-composed');

        const root = ComposedCombobox({
          children: () => {
            const inp = ComposedCombobox.Input({});
            const content = ComposedCombobox.Content({
              children: () => {
                const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
                return [o1];
              },
            });
            return [inp, content];
          },
        });
        container.appendChild(root);

        const input = root.querySelector('[role="combobox"]') as HTMLElement;
        const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
        expect(input?.getAttribute('aria-controls')).toBe(listbox?.id);
      });
    });
  });

  describe('Given a Combobox that is closed by default', () => {
    it('Then the content is hidden with data-state="closed"', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.getAttribute('data-state')).toBe('closed');
      expect(listbox?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('Given a Combobox with options', () => {
    it('Then options have role="option" and data-value', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
              return [o1, o2];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const options = root.querySelectorAll('[role="option"]');
      expect(options.length).toBe(2);
      expect((options[0] as HTMLElement).getAttribute('data-value')).toBe('apple');
      expect((options[1] as HTMLElement).getAttribute('data-value')).toBe('banana');
    });
  });

  describe('Given a Combobox input receives text', () => {
    it('Then the combobox opens', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.value = 'a';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.getAttribute('data-state')).toBe('open');
      expect(input.getAttribute('aria-expanded')).toBe('true');
    });

    it('Then calls onInputChange', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');
      const onInputChange = vi.fn();

      const root = ComposedCombobox({
        onInputChange,
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.value = 'test';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      expect(onInputChange).toHaveBeenCalledWith('test');
    });
  });

  describe('Given a Combobox with keyboard navigation', () => {
    it('Then ArrowDown navigates to the first option and sets aria-activedescendant', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
              return [o1, o2];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const options = root.querySelectorAll('[role="option"]');
      expect(input.getAttribute('aria-activedescendant')).toBe((options[0] as HTMLElement).id);
      expect((options[0] as HTMLElement).getAttribute('data-state')).toBe('active');
    });

    it('Then ArrowDown opens the listbox if closed', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.getAttribute('data-state')).toBe('open');
    });

    it('Then ArrowUp navigates backwards', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
              return [o1, o2];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.focus();
      // Navigate to index 1
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

      const options = root.querySelectorAll('[role="option"]');
      expect(input.getAttribute('aria-activedescendant')).toBe((options[1] as HTMLElement).id);

      // Navigate back up
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(input.getAttribute('aria-activedescendant')).toBe((options[0] as HTMLElement).id);
    });

    it('Then Enter selects the active option', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');
      const onValueChange = vi.fn();

      const root = ComposedCombobox({
        onValueChange,
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
              return [o1, o2];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.focus();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onValueChange).toHaveBeenCalledWith('apple');
      // After selection, should close
      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.getAttribute('data-state')).toBe('closed');
    });

    it('Then Escape closes the combobox', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      // Open first
      input.value = 'a';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.getAttribute('data-state')).toBe('open');

      // Escape to close
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(listbox?.getAttribute('data-state')).toBe('closed');
      expect(input.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Given a Combobox option is clicked', () => {
    it('Then calls onValueChange and closes', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');
      const onValueChange = vi.fn();

      const root = ComposedCombobox({
        onValueChange,
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const option = root.querySelector('[role="option"]') as HTMLElement;
      option?.click();

      expect(onValueChange).toHaveBeenCalledWith('apple');
    });
  });

  describe('Given a Combobox with classes prop', () => {
    it('Then applies input, content, and option classes', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        classes: { input: 'styled-input', content: 'styled-content', option: 'styled-option' },
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLElement;
      expect(input?.className).toContain('styled-input');

      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.className).toContain('styled-content');

      const option = root.querySelector('[role="option"]') as HTMLElement;
      expect(option?.className).toContain('styled-option');
    });
  });

  describe('Given a Combobox with defaultValue', () => {
    it('Then the input starts with that value and the matching option is selected', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        defaultValue: 'banana',
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
              return [o1, o2];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      expect(input.value).toBe('banana');

      const options = root.querySelectorAll('[role="option"]');
      expect((options[0] as HTMLElement).getAttribute('aria-selected')).toBe('false');
      expect((options[1] as HTMLElement).getAttribute('aria-selected')).toBe('true');
    });
  });

  describe('Given a Combobox.Input rendered outside ComposedCombobox', () => {
    it('Then throws an error', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      expect(() => {
        ComposedCombobox.Input({});
      }).toThrow('<Combobox.Input> must be used inside <ComposedCombobox>');
    });
  });

  describe('Given a Combobox.Content rendered outside ComposedCombobox', () => {
    it('Then throws an error', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      expect(() => {
        ComposedCombobox.Content({ children: [] });
      }).toThrow('<Combobox.Content> must be used inside <ComposedCombobox>');
    });
  });

  describe('Given a Combobox.Option rendered outside ComposedCombobox', () => {
    it('Then throws an error', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      expect(() => {
        ComposedCombobox.Option({ value: 'test', children: ['Test'] });
      }).toThrow('<Combobox.Option> must be used inside <ComposedCombobox>');
    });
  });

  describe('Given the input is focused and has a value', () => {
    it('Then opens the combobox on focus', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        defaultValue: 'apple',
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      const listbox = root.querySelector('[role="listbox"]') as HTMLElement;
      expect(listbox?.getAttribute('data-state')).toBe('open');
    });
  });

  describe('Given a Combobox option is selected', () => {
    it('Then updates the input value with the selected option value', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const input = root.querySelector('[role="combobox"]') as HTMLInputElement;
      const option = root.querySelector('[role="option"]') as HTMLElement;
      option?.click();

      expect(input.value).toBe('apple');
    });

    it('Then updates aria-selected on the matching option', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              const o2 = ComposedCombobox.Option({ value: 'banana', children: ['Banana'] });
              return [o1, o2];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      const option = root.querySelector('[data-value="apple"]') as HTMLElement;
      option?.click();

      const options = root.querySelectorAll('[role="option"]');
      expect((options[0] as HTMLElement).getAttribute('aria-selected')).toBe('true');
      expect((options[1] as HTMLElement).getAttribute('aria-selected')).toBe('false');
    });
  });

  describe('Given a Combobox with data attributes', () => {
    it('Then uses data-combobox-* prefix on elements', async () => {
      const { ComposedCombobox } = await import('../combobox-composed');

      const root = ComposedCombobox({
        children: () => {
          const inp = ComposedCombobox.Input({});
          const content = ComposedCombobox.Content({
            children: () => {
              const o1 = ComposedCombobox.Option({ value: 'apple', children: ['Apple'] });
              return [o1];
            },
          });
          return [inp, content];
        },
      });
      container.appendChild(root);

      // data-combobox-root is on the root element itself
      expect(root.hasAttribute('data-combobox-root')).toBe(true);
      expect(root.querySelector('[data-combobox-input]')).not.toBeNull();
      expect(root.querySelector('[data-combobox-content]')).not.toBeNull();
      expect(root.querySelector('[data-combobox-option]')).not.toBeNull();
    });
  });
});
