import { afterEach, describe, expect, test, vi } from 'vitest';
import { signal } from '../../runtime/signal';
import { click, press, type } from '../interactions';
import { findByTestId, findByText, queryByTestId, queryByText, waitFor } from '../queries';
import { renderTest } from '../render-test';
import { createTestRouter } from '../test-router';

describe('Testing Utilities', () => {
  let cleanups: (() => void)[] = [];

  afterEach(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups = [];
    window.history.replaceState(null, '', '/');
  });

  // ─── IT-8A-1: renderTest creates component and provides query utilities ───
  describe('renderTest', () => {
    test('provides findByText and click', async () => {
      // Create a simple counter component using signals
      const count = signal(0);

      const container = document.createElement('div');

      const display = document.createElement('span');
      display.setAttribute('data-testid', 'count-display');
      display.textContent = String(count.peek());

      const button = document.createElement('button');
      button.textContent = 'Increment';
      button.addEventListener('click', () => {
        count.value = count.value + 1;
        display.textContent = String(count.peek());
      });

      container.appendChild(display);
      container.appendChild(button);

      const result = renderTest(container);
      cleanups.push(result.unmount);

      // findByText works
      const btn = result.findByText('Increment');
      expect(btn).toBe(button);

      // findByTestId works
      const countEl = result.findByTestId('count-display');
      expect(countEl).toBe(display);
      expect(countEl.textContent).toBe('0');

      // Click the button and verify the count updates
      await result.click(btn);
      expect(display.textContent).toBe('1');

      await result.click(btn);
      expect(display.textContent).toBe('2');
    });

    test('queryByText returns null when not found', () => {
      const el = document.createElement('div');
      el.textContent = 'Hello';

      const result = renderTest(el);
      cleanups.push(result.unmount);

      expect(result.queryByText('Hello')).not.toBeNull();
      expect(result.queryByText('Nonexistent')).toBeNull();
    });

    test('queryByTestId returns null when not found', () => {
      const el = document.createElement('div');
      el.setAttribute('data-testid', 'my-el');

      const result = renderTest(el);
      cleanups.push(result.unmount);

      expect(result.queryByTestId('my-el')).toBe(el);
      expect(result.queryByTestId('missing')).toBeNull();
    });

    test('findByText throws when not found', () => {
      const el = document.createElement('div');
      el.textContent = 'Hello';

      const result = renderTest(el);
      cleanups.push(result.unmount);

      expect(() => result.findByText('Missing')).toThrow('findByText');
    });

    test('findByTestId throws when not found', () => {
      const el = document.createElement('div');

      const result = renderTest(el);
      cleanups.push(result.unmount);

      expect(() => result.findByTestId('missing')).toThrow('findByTestId');
    });

    test('unmount removes container from DOM', () => {
      const el = document.createElement('div');
      el.textContent = 'Temp';

      const result = renderTest(el);
      expect(document.body.contains(result.container)).toBe(true);

      result.unmount();
      expect(document.body.contains(result.container)).toBe(false);
    });
  });

  // ─── Queries ──────────────────────────────────────────────────────────────
  describe('queries', () => {
    test('findByText walks descendants', () => {
      const outer = document.createElement('div');
      const inner = document.createElement('span');
      inner.textContent = 'Nested Text';
      outer.appendChild(inner);

      const found = findByText(outer, 'Nested Text');
      expect(found).toBe(inner);
    });

    test('queryByText returns null for missing text', () => {
      const el = document.createElement('div');
      el.textContent = 'Something';

      expect(queryByText(el, 'Other')).toBeNull();
    });

    test('findByTestId uses data-testid attribute', () => {
      const parent = document.createElement('div');
      const child = document.createElement('button');
      child.setAttribute('data-testid', 'save-btn');
      parent.appendChild(child);

      expect(findByTestId(parent, 'save-btn')).toBe(child);
    });

    test('queryByTestId returns null for missing id', () => {
      const el = document.createElement('div');
      expect(queryByTestId(el, 'nope')).toBeNull();
    });

    test('waitFor resolves when assertion passes', async () => {
      let ready = false;
      setTimeout(() => {
        ready = true;
      }, 50);

      await waitFor(() => {
        if (!ready) throw new TypeError('not ready');
      });

      expect(ready).toBe(true);
    });

    test('waitFor throws on timeout', async () => {
      await expect(
        waitFor(
          () => {
            throw new TypeError('never passes');
          },
          { timeout: 100 },
        ),
      ).rejects.toThrow('never passes');
    });
  });

  // ─── Interactions ─────────────────────────────────────────────────────────
  describe('interactions', () => {
    test('click dispatches MouseEvent', async () => {
      const handler = vi.fn();
      const btn = document.createElement('button');
      btn.addEventListener('click', handler);

      await click(btn);

      expect(handler).toHaveBeenCalledOnce();
      const event = handler.mock.calls[0][0] as MouseEvent;
      expect(event.bubbles).toBe(true);
      expect(event.cancelable).toBe(true);
    });

    test('type sets value and dispatches events', async () => {
      const inputHandler = vi.fn();
      const changeHandler = vi.fn();

      const input = document.createElement('input');
      input.addEventListener('input', inputHandler);
      input.addEventListener('change', changeHandler);

      await type(input, 'Hello World');

      expect(input.value).toBe('Hello World');
      expect(inputHandler).toHaveBeenCalledOnce();
      expect(changeHandler).toHaveBeenCalledOnce();
    });

    test('type works with textarea', async () => {
      const textarea = document.createElement('textarea');

      await type(textarea, 'Multi\nLine');

      expect(textarea.value).toBe('Multi\nLine');
    });

    test('type throws for non-input elements', async () => {
      const div = document.createElement('div');

      await expect(type(div, 'text')).rejects.toThrow('not an <input>');
    });

    test('type accepts CSS selector string', async () => {
      const input = document.createElement('input');
      input.setAttribute('data-testid', 'my-input');
      document.body.appendChild(input);

      try {
        await type('[data-testid="my-input"]', 'selector-text');
        expect(input.value).toBe('selector-text');
      } finally {
        input.remove();
      }
    });

    test('press dispatches keydown and keyup', async () => {
      const keydownHandler = vi.fn();
      const keyupHandler = vi.fn();

      document.body.addEventListener('keydown', keydownHandler);
      document.body.addEventListener('keyup', keyupHandler);

      try {
        await press('Enter');

        expect(keydownHandler).toHaveBeenCalledOnce();
        expect(keyupHandler).toHaveBeenCalledOnce();

        const downEvent = keydownHandler.mock.calls[0][0] as KeyboardEvent;
        expect(downEvent.key).toBe('Enter');
        expect(downEvent.bubbles).toBe(true);

        const upEvent = keyupHandler.mock.calls[0][0] as KeyboardEvent;
        expect(upEvent.key).toBe('Enter');
      } finally {
        document.body.removeEventListener('keydown', keydownHandler);
        document.body.removeEventListener('keyup', keyupHandler);
      }
    });
  });

  // ─── IT-8A-2: createTestRouter renders routes with mocked loaders ────────
  describe('createTestRouter', () => {
    test('renders route with loader data', async () => {
      const { component, router } = await createTestRouter({
        '/': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Home Page';
            return el;
          },
          loader: async () => ({ title: 'Home' }),
        },
        '/about': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'About Page';
            return el;
          },
          loader: async () => ({ title: 'About' }),
        },
      });
      cleanups.push(() => {
        router.dispose();
        component.remove();
      });

      // Initial route renders
      expect(component.textContent).toBe('Home Page');

      // Loader data is available (loaders run async, so wait for them)
      await waitFor(() => {
        expect(router.loaderData.peek()).toEqual([{ title: 'Home' }]);
      });
    });

    test('navigate changes the displayed route', async () => {
      const { component, navigate, router } = await createTestRouter({
        '/': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Home';
            return el;
          },
        },
        '/dashboard': {
          component: () => {
            const el = document.createElement('div');
            el.textContent = 'Dashboard';
            return el;
          },
        },
      });
      cleanups.push(() => {
        router.dispose();
        component.remove();
      });

      expect(component.textContent).toBe('Home');

      await navigate('/dashboard');

      expect(component.textContent).toBe('Dashboard');
      expect(router.current.peek()?.route.pattern).toBe('/dashboard');
    });

    test('respects initialPath option', async () => {
      const { component, router } = await createTestRouter(
        {
          '/': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'Home';
              return el;
            },
          },
          '/settings': {
            component: () => {
              const el = document.createElement('div');
              el.textContent = 'Settings';
              return el;
            },
          },
        },
        { initialPath: '/settings' },
      );
      cleanups.push(() => {
        router.dispose();
        component.remove();
      });

      expect(component.textContent).toBe('Settings');
      expect(router.current.peek()?.route.pattern).toBe('/settings');
    });
  });

  // ─── IT-8A-3: form interaction simulation ────────────────────────────────
  describe('form interaction simulation', () => {
    test('type into form fields and submit', async () => {
      const submitted = vi.fn();

      const formEl = document.createElement('form');
      formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(formEl);
        submitted({
          email: fd.get('email'),
          name: fd.get('name'),
        });
      });

      const nameInput = document.createElement('input');
      nameInput.name = 'name';
      nameInput.setAttribute('data-testid', 'name-input');

      const emailInput = document.createElement('input');
      emailInput.name = 'email';
      emailInput.setAttribute('data-testid', 'email-input');

      const submitBtn = document.createElement('button');
      submitBtn.type = 'submit';
      submitBtn.textContent = 'Submit';

      formEl.appendChild(nameInput);
      formEl.appendChild(emailInput);
      formEl.appendChild(submitBtn);

      const result = renderTest(formEl);
      cleanups.push(result.unmount);

      // Fill the form using type
      await type(result.findByTestId('name-input'), 'Alice');
      await type(result.findByTestId('email-input'), 'alice@example.com');

      expect(nameInput.value).toBe('Alice');
      expect(emailInput.value).toBe('alice@example.com');

      // Submit the form by clicking the submit button
      await click(submitBtn);

      expect(submitted).toHaveBeenCalledWith({
        email: 'alice@example.com',
        name: 'Alice',
      });
    });
  });
});
