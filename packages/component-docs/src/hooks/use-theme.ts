/**
 * App-global theme state via Context.
 *
 * Previously used a module-level signal workaround because production builds
 * code-split route components into dynamic imports that resolved after the
 * synchronous Provider._stack was popped. This has been fixed in the framework
 * (commit caaee3414) — RouterView now captures the full ContextScope before
 * resolving dynamic imports and restores it when rendering lazy components.
 */

import { createContext, useContext } from '@vertz/ui';

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

// ── Initial theme ───────────────────────────────────────────

export function getInitialTheme(): 'dark' | 'light' {
  return getThemeCookie() ?? 'dark';
}

// ── Theme context ───────────────────────────────────────────

interface ThemeContextValue {
  theme: 'dark' | 'light';
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>();

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be called within ThemeContext.Provider');
  return ctx;
}

export { setThemeCookie };
