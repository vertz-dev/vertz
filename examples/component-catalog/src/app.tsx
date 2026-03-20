import {
  getInjectedCSS,
  globalCss,
  Link,
  RouterContext,
  RouterView,
  ThemeProvider,
} from '@vertz/ui';
import { categoryLabels, categoryOrder, componentRegistry, groupByCategory } from './demos';
import { appRouter } from './router';
import { layoutStyles, navStyles, scrollStyles } from './styles/catalog';
import { catalogTheme, themeGlobals, themeStyles } from './styles/theme';

const fontFaceCss = `
/* geist-cyrillic-wght-normal */
@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('/fonts/geist-cyrillic-wght-normal.woff2') format('woff2-variations');
  unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}
/* geist-latin-ext-wght-normal */
@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('/fonts/geist-latin-ext-wght-normal.woff2') format('woff2-variations');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}
/* geist-latin-wght-normal */
@font-face {
  font-family: 'Geist Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('/fonts/geist-latin-wght-normal.woff2') format('woff2-variations');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
`;

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
  'html, body': {
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
  },
});

// Collect all component CSS from theme styles
const componentCss = Object.values(themeStyles)
  .map((s: { css?: string }) => s.css)
  .filter((css): css is string => Boolean(css));

export { getInjectedCSS };
export const theme = catalogTheme;
export const styles = [fontFaceCss, themeGlobals.css, appGlobals.css, scrollStyles.css, ...componentCss];

function Sidebar() {
  let currentTheme = 'light';
  const grouped = groupByCategory(componentRegistry);

  function toggleTheme() {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    currentTheme = next;
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <nav className={layoutStyles.sidebar} aria-label="Component navigation">
      <div className={navStyles.title}>Components</div>
      <div className={navStyles.subtitle}>{componentRegistry.length} themed components</div>
      <div
        className={scrollStyles.thin}
        style="flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;"
      >
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <Link href="/" className={navStyles.navItem} activeClass={navStyles.navItemActive}>
            Overview
          </Link>
          {categoryOrder.flatMap((cat) => {
            const entries = grouped.get(cat) ?? [];
            if (entries.length === 0) return [];
            return [
              <div>
                <div className={navStyles.categoryTitle}>{categoryLabels[cat]}</div>
                {entries.map((entry) => (
                  <Link
                    href={`/${entry.slug}`}
                    className={navStyles.navItem}
                    activeClass={navStyles.navItemActive}
                  >
                    {entry.name}
                  </Link>
                ))}
              </div>,
            ];
          })}
        </div>
      </div>
      <button type="button" className={navStyles.themeToggle} onClick={toggleTheme}>
        Toggle Theme
      </button>
    </nav>
  );
}

export function App() {
  return (
    <div>
      <ThemeProvider theme="light">
        <RouterContext.Provider value={appRouter}>
          <div className={layoutStyles.shell}>
            <Sidebar />
            <div className={`${layoutStyles.main} ${scrollStyles.thin}`}>
              <RouterView router={appRouter} fallback={() => <div>Page not found</div>} />
            </div>
          </div>
        </RouterContext.Provider>
      </ThemeProvider>
    </div>
  );
}
