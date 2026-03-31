/**
 * App-global theme state.
 *
 * Uses module-level shared state instead of context because the production
 * build code-splits route components into dynamic imports. Dynamic imports
 * resolve asynchronously, after the synchronous Provider._stack has already
 * been popped — so context-based theme sharing breaks across route boundaries.
 *
 * Module-level state avoids this entirely: every import references the same
 * variable, regardless of when the importing module loads.
 */

import { signal } from '@vertz/ui';

// ── Cookie helpers ──────────────────────────────────────────

function getThemeCookie(): 'dark' | 'light' | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )theme=(light|dark)/);
  return (match?.[1] as 'dark' | 'light') ?? null;
}

function setThemeCookie(value: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return;
  document.cookie = `theme=${value};path=/;max-age=31536000;SameSite=Lax`;
}

// ── Shared state ────────────────────────────────────────────

export function getInitialTheme(): 'dark' | 'light' {
  return getThemeCookie() ?? 'dark';
}

const themeSignal = signal<'dark' | 'light'>(getInitialTheme());

export function useTheme(): { theme: 'dark' | 'light'; toggle: () => void } {
  return {
    get theme() {
      return themeSignal.value;
    },
    toggle,
  };
}

function toggle(): void {
  const next = themeSignal.value === 'dark' ? 'light' : 'dark';
  themeSignal.value = next;
  setThemeCookie(next);
  if (typeof document !== 'undefined') {
    document.querySelector('[data-theme]')?.setAttribute('data-theme', next);
    // Re-apply customization needs to be imported lazily to avoid circular deps
    import('./use-customization').then((m) => m.reapplyCustomization(next));
  }
}
