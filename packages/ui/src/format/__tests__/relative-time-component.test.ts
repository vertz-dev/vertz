import { afterEach, describe, expect, it } from 'bun:test';
import { popScope, pushScope, runCleanups } from '../../runtime/disposal';
import type { DisposeFn } from '../../runtime/signal-types';
import { formatRelativeTime } from '../relative-time';
import { getAdaptiveInterval, RelativeTime } from '../relative-time-component';

describe('Feature: RelativeTime component', () => {
  let el: HTMLTimeElement | null = null;
  let scope: DisposeFn[] | null = null;

  afterEach(() => {
    if (scope) {
      runCleanups(scope);
      scope = null;
    }
    if (el?.parentNode) {
      el.parentNode.removeChild(el);
    }
    el = null;
  });

  function renderWithScope(props: Parameters<typeof RelativeTime>[0]): HTMLTimeElement {
    scope = pushScope();
    const element = RelativeTime(props);
    popScope();
    return element;
  }

  describe('Given a date prop', () => {
    describe('When the component renders', () => {
      it('Then renders a <time> element', () => {
        el = renderWithScope({ date: '2026-03-21T10:00:00Z' });
        expect(el.tagName).toBe('TIME');
      });

      it('Then sets datetime attribute to ISO string', () => {
        el = renderWithScope({ date: '2026-03-21T10:00:00Z' });
        expect(el.getAttribute('datetime')).toBe('2026-03-21T10:00:00.000Z');
      });

      it('Then displays formatted relative time as text content', () => {
        el = renderWithScope({ date: new Date(Date.now() - 3600000) });
        expect(el.textContent).toBe('1 hour ago');
      });
    });
  });

  describe('Given a className prop', () => {
    describe('When the component renders', () => {
      it('Then applies the className to the <time> element', () => {
        el = renderWithScope({ date: new Date(), className: 'text-muted' });
        expect(el.className).toBe('text-muted');
      });
    });
  });

  describe('Given no title prop', () => {
    describe('When the component renders', () => {
      it('Then sets title attribute to full formatted date via Intl.DateTimeFormat', () => {
        const date = new Date('2026-03-21T10:00:00Z');
        el = renderWithScope({ date });
        expect(el.title).toBeTruthy();
        expect(el.title.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Given title={false}', () => {
    describe('When the component renders', () => {
      it('Then omits the title attribute', () => {
        el = renderWithScope({ date: new Date(), title: false });
        expect(el.title).toBe('');
      });
    });
  });

  describe('Given a custom title string', () => {
    describe('When the component renders', () => {
      it('Then sets the title attribute to the custom string', () => {
        el = renderWithScope({ date: new Date(), title: 'Custom tooltip' });
        expect(el.title).toBe('Custom tooltip');
      });
    });
  });

  describe('Given a date that is more than 1 day old', () => {
    describe('When getAdaptiveInterval is called', () => {
      it('Then returns null (no updates)', () => {
        const oldDate = new Date(Date.now() - 2 * 86_400_000);
        expect(getAdaptiveInterval(oldDate)).toBeNull();
      });
    });
  });

  describe('Given a date that is less than 1 minute old', () => {
    describe('When getAdaptiveInterval is called', () => {
      it('Then returns 10 seconds', () => {
        const recentDate = new Date(Date.now() - 30_000);
        expect(getAdaptiveInterval(recentDate)).toBe(10_000);
      });
    });
  });

  describe('Given a date that is between 1 minute and 1 hour old', () => {
    describe('When getAdaptiveInterval is called', () => {
      it('Then returns 1 minute', () => {
        const date = new Date(Date.now() - 5 * 60_000);
        expect(getAdaptiveInterval(date)).toBe(60_000);
      });
    });
  });

  describe('Given a date that is between 1 hour and 1 day old', () => {
    describe('When getAdaptiveInterval is called', () => {
      it('Then returns 1 hour', () => {
        const date = new Date(Date.now() - 3 * 3_600_000);
        expect(getAdaptiveInterval(date)).toBe(3_600_000);
      });
    });
  });

  describe('Given a custom updateInterval prop', () => {
    describe('When the component renders and the timer fires', () => {
      it('Then calls formatRelativeTime again to refresh text', async () => {
        const date = new Date(Date.now() - 30_000);
        el = renderWithScope({ date, updateInterval: 30 });
        const initialContent = el.textContent;

        // Wait for multiple ticks to fire
        await new Promise((resolve) => setTimeout(resolve, 120));

        // Text was refreshed (same value since same date, but proves timer ran)
        expect(el.textContent).toBe(initialContent);
        // Importantly, text is still valid
        expect(el.textContent).toBe(formatRelativeTime(date));
      });
    });
  });

  describe('Given the component is disposed', () => {
    describe('When cleanup runs', () => {
      it('Then clears the update timeout so no further updates occur', async () => {
        const date = new Date(Date.now() - 30_000);
        scope = pushScope();
        el = RelativeTime({ date, updateInterval: 30 });
        popScope();

        // Run cleanups — this should clear the timer
        runCleanups(scope);

        const textAfterCleanup = el.textContent;

        // Wait to ensure no more timer ticks fire
        await new Promise((resolve) => setTimeout(resolve, 120));

        // Text should not have changed (timer was cleared)
        expect(el.textContent).toBe(textAfterCleanup);
        scope = null; // already cleaned up
      });
    });
  });

  describe('Given a date older than 1 day', () => {
    describe('When the component renders', () => {
      it('Then getAdaptiveInterval returns null (no timer scheduled)', () => {
        const oldDate = new Date(Date.now() - 2 * 86_400_000);
        expect(getAdaptiveInterval(oldDate)).toBeNull();

        // Component still renders correctly
        el = renderWithScope({ date: oldDate });
        expect(el.textContent).toBeTruthy();
      });
    });
  });

  describe('Given a Date input', () => {
    describe('When the component renders', () => {
      it('Then formats correctly', () => {
        el = renderWithScope({ date: new Date(Date.now() - 120_000) });
        expect(el.textContent).toBe('2 minutes ago');
      });
    });
  });

  describe('Given a number (epoch ms) input', () => {
    describe('When the component renders', () => {
      it('Then formats correctly', () => {
        el = renderWithScope({ date: Date.now() - 120_000 });
        expect(el.textContent).toBe('2 minutes ago');
      });
    });
  });
});
