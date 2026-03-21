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

// ── App component ──────────────────────────────────────────
function getInitialTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('vertz-docs-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  }
  return 'dark';
}

export function App() {
  let currentTheme: 'dark' | 'light' = getInitialTheme();

  function toggle() {
    const next = currentTheme === 'dark' ? 'light' : 'dark';
    // DOM update + localStorage BEFORE signal write (compiler may stop after signal write)
    document.querySelectorAll('[data-theme]').forEach((el) => {
      el.setAttribute('data-theme', next);
    });
    localStorage.setItem('vertz-docs-theme', next);
    currentTheme = next;
  }

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, toggle }}>
      <ThemeProvider theme={currentTheme}>
        <RouterView router={router} fallback={() => <IndexRedirect />} />
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}
