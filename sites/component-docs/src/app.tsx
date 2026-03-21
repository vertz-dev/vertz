import { createContext, getInjectedCSS, ThemeProvider, useContext } from '@vertz/ui';
import { createRouter, defineRoutes, RouterView } from '@vertz/ui/router';
import { ComponentPage } from './pages/component-page';
import { IndexRedirect } from './pages/index-redirect';
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

  function toggle() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setThemeCookie(currentTheme);
    if (typeof document !== 'undefined') {
      document.querySelector('[data-theme]')?.setAttribute('data-theme', currentTheme);
    }
  }

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, toggle }}>
      <ThemeProvider theme={currentTheme}>
        <RouterView router={router} fallback={() => <IndexRedirect />} />
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
