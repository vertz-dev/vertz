import { getInjectedCSS, globalCss, RouterView, ThemeProvider } from '@vertz/ui';
import { categoryLabels, categoryOrder, componentRegistry, groupByCategory } from './demos';
import { appRouter, Link } from './router';
import { layoutStyles, navStyles, scrollStyles } from './styles/catalog';
import { catalogTheme, themeGlobals, themeStyles } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

// Collect all component CSS from theme styles
const componentCss = Object.values(themeStyles)
  .map((s: { css?: string }) => s.css)
  .filter((css): css is string => Boolean(css));

export { getInjectedCSS };
export const theme = catalogTheme;
export const styles = [themeGlobals.css, appGlobals.css, scrollStyles.css, ...componentCss];

function Sidebar() {
  let currentTheme = 'light';
  const grouped = groupByCategory(componentRegistry);

  function toggleTheme() {
    const next = currentTheme === 'light' ? 'dark' : 'light';
    currentTheme = next;
    document.documentElement.setAttribute('data-theme', next);
  }

  return (
    <nav class={layoutStyles.sidebar} aria-label="Component navigation">
      <div class={navStyles.title}>Components</div>
      <div class={navStyles.subtitle}>{componentRegistry.length} themed components</div>
      <div class={scrollStyles.thin} style="flex: 1; min-height: 0; overflow-y: auto;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <Link href="/" className={navStyles.navItem} activeClass={navStyles.navItemActive}>
            Overview
          </Link>
          {categoryOrder.map((cat) => {
            const entries = grouped.get(cat) ?? [];
            if (entries.length === 0) return null;
            return (
              <div key={cat}>
                <div class={navStyles.categoryTitle}>{categoryLabels[cat]}</div>
                {entries.map((entry) => (
                  <Link
                    key={entry.slug}
                    href={`/${entry.slug}`}
                    className={navStyles.navItem}
                    activeClass={navStyles.navItemActive}
                  >
                    {entry.name}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      <button type="button" class={navStyles.themeToggle} onClick={toggleTheme}>
        Toggle Theme
      </button>
    </nav>
  );
}

export function App() {
  return (
    <div>
      <ThemeProvider theme="light">
        <div class={layoutStyles.shell}>
          <Sidebar />
          <div class={`${layoutStyles.main} ${scrollStyles.thin}`} style="overflow-y: auto;">
            <RouterView router={appRouter} fallback={() => <div>Page not found</div>} />
          </div>
        </div>
      </ThemeProvider>
    </div>
  );
}
