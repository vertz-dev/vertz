import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { ComposedNavigationMenu } from '../navigation-menu-composed';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderNavMenu(
  opts: { orientation?: 'horizontal' | 'vertical'; delayOpen?: number; delayClose?: number } = {},
): HTMLElement {
  return ComposedNavigationMenu({
    ...opts,
    children: () => {
      const list = ComposedNavigationMenu.List({
        children: () => {
          const item1 = ComposedNavigationMenu.Item({
            value: 'products',
            children: () => {
              const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
              const content = ComposedNavigationMenu.Content({
                children: ['Products content'],
              });
              return [trigger, content];
            },
          });
          const item2 = ComposedNavigationMenu.Item({
            value: 'resources',
            children: () => {
              const trigger = ComposedNavigationMenu.Trigger({ children: ['Resources'] });
              const content = ComposedNavigationMenu.Content({
                children: ['Resources content'],
              });
              return [trigger, content];
            },
          });
          const link = ComposedNavigationMenu.Link({ href: '/about', children: ['About'] });
          return [item1, item2, link];
        },
      });
      const viewport = ComposedNavigationMenu.Viewport({});
      return [list, viewport];
    },
  });
}

describe('Composed NavigationMenu', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeChild(container);
  });

  describe('Given a NavigationMenu with List, Item, Trigger, Content, Link, and Viewport', () => {
    describe('When rendered', () => {
      it('Then root is a <nav> element', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        expect(root.tagName).toBe('NAV');
      });

      it('Then triggers have aria-expanded="false" by default', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
      });

      it('Then content is hidden by default', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const contents = root.querySelectorAll('[data-part="nav-content"]');
        for (const content of contents) {
          expect(content.getAttribute('aria-hidden')).toBe('true');
          expect((content as HTMLElement).style.display).toBe('none');
        }
      });
    });
  });

  describe('Given a NavigationMenu with items', () => {
    describe('When a trigger is clicked', () => {
      it('Then opens content and sets aria-expanded="true"', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;

        trigger.click();

        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(trigger.getAttribute('data-state')).toBe('open');
      });

      it('Then clicking again closes content', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;

        trigger.click();
        trigger.click();

        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(trigger.getAttribute('data-state')).toBe('closed');
      });
    });
  });

  describe('Given a NavigationMenu with multiple items', () => {
    describe('When different triggers are clicked', () => {
      it('Then only one panel is open at a time', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const t1 = root.querySelector('button[data-value="products"]') as HTMLElement;
        const t2 = root.querySelector('button[data-value="resources"]') as HTMLElement;

        t1.click();
        expect(t1.getAttribute('aria-expanded')).toBe('true');

        t2.click();
        expect(t1.getAttribute('aria-expanded')).toBe('false');
        expect(t1.getAttribute('data-state')).toBe('closed');
        expect(t2.getAttribute('aria-expanded')).toBe('true');
        expect(t2.getAttribute('data-state')).toBe('open');
      });
    });
  });

  describe('Given a NavigationMenu with keyboard navigation', () => {
    describe('When ArrowRight is pressed on the list', () => {
      it('Then navigates between triggers', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const t1 = root.querySelector('button[data-value="products"]') as HTMLElement;
        const t2 = root.querySelector('button[data-value="resources"]') as HTMLElement;
        const list = root.querySelector('[data-part="nav-list"]') as HTMLElement;

        t1.focus();
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(t2);
      });
    });

    describe('When ArrowLeft is pressed on the list', () => {
      it('Then navigates between triggers', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const t1 = root.querySelector('button[data-value="products"]') as HTMLElement;
        const t2 = root.querySelector('button[data-value="resources"]') as HTMLElement;
        const list = root.querySelector('[data-part="nav-list"]') as HTMLElement;

        t2.focus();
        list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(document.activeElement).toBe(t1);
      });
    });

    describe('When Enter is pressed on a trigger', () => {
      it('Then opens panel and focuses first focusable inside', () => {
        const root = ComposedNavigationMenu({
          children: () => {
            const list = ComposedNavigationMenu.List({
              children: () => {
                const item = ComposedNavigationMenu.Item({
                  value: 'products',
                  children: () => {
                    const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
                    const content = ComposedNavigationMenu.Content({
                      children: () => {
                        const a = document.createElement('a');
                        a.href = '#';
                        a.textContent = 'First link';
                        return [a];
                      },
                    });
                    return [trigger, content];
                  },
                });
                return [item];
              },
            });
            const viewport = ComposedNavigationMenu.Viewport({});
            return [list, viewport];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
        trigger.focus();
        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        vi.runAllTimers();
        return new Promise<void>((resolve) => {
          queueMicrotask(() => {
            const link = root.querySelector('a[href="#"]') as HTMLElement;
            expect(document.activeElement).toBe(link);
            resolve();
          });
        });
      });
    });

    describe('When Escape is pressed on a trigger', () => {
      it('Then closes panel', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;

        trigger.click();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
      });
    });

    describe('When Escape is pressed inside content', () => {
      it('Then closes panel and returns focus to trigger', () => {
        const root = ComposedNavigationMenu({
          children: () => {
            const list = ComposedNavigationMenu.List({
              children: () => {
                const item = ComposedNavigationMenu.Item({
                  value: 'products',
                  children: () => {
                    const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
                    const content = ComposedNavigationMenu.Content({
                      children: () => {
                        const a = document.createElement('a');
                        a.href = '#';
                        a.textContent = 'First link';
                        return [a];
                      },
                    });
                    return [trigger, content];
                  },
                });
                return [item];
              },
            });
            const viewport = ComposedNavigationMenu.Viewport({});
            return [list, viewport];
          },
        });
        container.appendChild(root);

        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
        trigger.click();

        const link = root.querySelector('a[href="#"]') as HTMLElement;
        link.focus();

        const contentEl = root.querySelector('[data-part="nav-content"]') as HTMLElement;
        contentEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
      });
    });
  });

  describe('Given a NavigationMenu with hover interaction', () => {
    describe('When mouseenter on trigger with delay', () => {
      it('Then opens content after delayOpen', () => {
        const root = renderNavMenu({ delayOpen: 200 });
        container.appendChild(root);
        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
        const contentEl = root.querySelector('[data-part="nav-content"]') as HTMLElement;

        trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        expect(contentEl.getAttribute('aria-hidden')).toBe('true');

        vi.advanceTimersByTime(200);
        expect(contentEl.getAttribute('aria-hidden')).toBe('false');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
      });
    });

    describe('When hovering from trigger to content', () => {
      it('Then cancels close (grace period)', () => {
        const root = renderNavMenu({ delayOpen: 200, delayClose: 300 });
        container.appendChild(root);
        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
        const contentEl = root.querySelector('[data-part="nav-content"]') as HTMLElement;

        trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        vi.advanceTimersByTime(200);
        expect(contentEl.getAttribute('aria-hidden')).toBe('false');

        trigger.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        contentEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        vi.advanceTimersByTime(300);
        expect(contentEl.getAttribute('aria-hidden')).toBe('false');
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
      });
    });
  });

  describe('Given a NavigationMenu with Link sub-component', () => {
    describe('When rendered', () => {
      it('Then Link creates an <a> element with href', () => {
        const root = renderNavMenu();
        container.appendChild(root);
        const link = root.querySelector('a[href="/about"]') as HTMLElement;

        expect(link.tagName).toBe('A');
        expect(link.getAttribute('href')).toBe('/about');
        expect(link.textContent).toBe('About');
      });
    });
  });

  describe('Given a NavigationMenu with classes', () => {
    describe('When rendered', () => {
      it('Then applies classes to root, list, trigger, content, link, and viewport', () => {
        const root = ComposedNavigationMenu({
          classes: {
            root: 'nav-root',
            list: 'nav-list',
            trigger: 'nav-trigger',
            content: 'nav-content',
            link: 'nav-link',
            viewport: 'nav-viewport',
          },
          children: () => {
            const list = ComposedNavigationMenu.List({
              children: () => {
                const item = ComposedNavigationMenu.Item({
                  value: 'products',
                  children: () => {
                    const trigger = ComposedNavigationMenu.Trigger({ children: ['Products'] });
                    const content = ComposedNavigationMenu.Content({
                      children: ['Products content'],
                    });
                    return [trigger, content];
                  },
                });
                const link = ComposedNavigationMenu.Link({
                  href: '/about',
                  children: ['About'],
                });
                return [item, link];
              },
            });
            const viewport = ComposedNavigationMenu.Viewport({});
            return [list, viewport];
          },
        });
        container.appendChild(root);

        expect(root.classList.contains('nav-root')).toBe(true);

        const listEl = root.querySelector('[data-part="nav-list"]') as HTMLElement;
        expect(listEl.classList.contains('nav-list')).toBe(true);

        const trigger = root.querySelector('button[data-value="products"]') as HTMLElement;
        expect(trigger.classList.contains('nav-trigger')).toBe(true);

        const contentEl = root.querySelector('[data-part="nav-content"]') as HTMLElement;
        expect(contentEl.classList.contains('nav-content')).toBe(true);

        const linkEl = root.querySelector('a[href="/about"]') as HTMLElement;
        expect(linkEl.classList.contains('nav-link')).toBe(true);

        const viewportEl = root.querySelector('[data-part="nav-viewport"]') as HTMLElement;
        expect(viewportEl.classList.contains('nav-viewport')).toBe(true);
      });
    });
  });

  describe('Given sub-components used outside NavigationMenu', () => {
    it('Then List throws an error', () => {
      expect(() => {
        ComposedNavigationMenu.List({ children: [] });
      }).toThrow('must be used inside <NavigationMenu>');
    });

    it('Then Item throws an error', () => {
      expect(() => {
        ComposedNavigationMenu.Item({ value: 'test', children: [] });
      }).toThrow('must be used inside <NavigationMenu.List>');
    });
  });
});
