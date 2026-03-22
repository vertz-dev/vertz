import { createContext, getInjectedCSS, ThemeProvider, useContext } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import {
  applyAccent,
  applyPalette,
  applyRadius,
  getCustomizationCookie,
  reapplyCustomization,
  setModuleState,
} from './hooks/use-customization';
import { ComponentPage } from './pages/component-page';
import { IndexRedirect } from './pages/index-redirect';
import { OverviewPage } from './pages/overview-page';
import { appGlobals } from './styles/globals';
import { docsTheme, themeGlobals } from './styles/theme';

// ── SSR module exports ─────────────────────────────────────
export { getInjectedCSS };
export const theme = docsTheme;
export const styles = [themeGlobals.css, appGlobals.css];

// ── Theme context ──────────────────────────────────────────
interface ThemeContextValue {
  theme: string;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>();

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // biome-ignore lint: app-level context guard, not a server error
    throw new Error('useTheme must be called within ThemeContext.Provider');
  }
  return ctx;
}

// ── Routes ─────────────────────────────────────────────────
const routes = defineRoutes({
  '/': {
    component: () => <IndexRedirect />,
  },
  '/overview': {
    component: () => <OverviewPage />,
  },
  '/components/:name': {
    component: () => <ComponentPage />,
  },
});

const router = createRouter(routes);

// ── Theme helpers ──────────────────────────────────────────
function getThemeCookie(): 'dark' | 'light' | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )theme=(light|dark)/);
  return (match?.[1] as 'dark' | 'light') ?? null;
}

function setThemeCookie(value: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return;
  document.cookie = `theme=${value};path=/;max-age=31536000;SameSite=Lax`;
}

export function getInitialTheme(): 'dark' | 'light' {
  return getThemeCookie() ?? 'dark';
}

// ── App component ──────────────────────────────────────────
export function App() {
  let currentTheme: 'dark' | 'light' = getInitialTheme();

  // Restore saved customization on mount
  if (typeof document !== 'undefined') {
    const saved = getCustomizationCookie();
    if (saved) {
      setModuleState(saved);
      queueMicrotask(() => {
        if (saved.palette !== 'zinc') applyPalette(saved.palette, currentTheme);
        if (saved.radius !== 'md') applyRadius(saved.radius);
        if (saved.accent !== 'default') applyAccent(saved.accent, currentTheme);
      });
    }
  }

  function toggle() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setThemeCookie(currentTheme);
    if (typeof document !== 'undefined') {
      document.querySelector('[data-theme]')?.setAttribute('data-theme', currentTheme);
      reapplyCustomization(currentTheme);
    }
  }

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, toggle }}>
      <ThemeProvider theme={currentTheme}>
        <RouterView router={router} fallback={() => <div>Page not found</div>} />
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
