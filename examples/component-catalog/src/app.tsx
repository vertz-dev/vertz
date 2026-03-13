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

  // Build nav links
  const navLinks = document.createElement('div');
  navLinks.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';

  navLinks.append(
    Link({
      href: '/',
      children: 'Overview',
      className: navStyles.navItem,
      activeClass: navStyles.navItemActive,
    }),
  );

  for (const cat of categoryOrder) {
    const entries = grouped.get(cat) ?? [];
    if (entries.length === 0) continue;

    const section = document.createElement('div');
    const title = document.createElement('div');
    title.className = navStyles.categoryTitle;
    title.textContent = categoryLabels[cat];
    section.append(title);

    for (const entry of entries) {
      section.append(
        Link({
          href: `/${entry.slug}`,
          children: entry.name,
          className: navStyles.navItem,
          activeClass: navStyles.navItemActive,
        }),
      );
    }
    navLinks.append(section);
  }

  // Scrollable nav container
  const navScroll = document.createElement('div');
  navScroll.className = scrollStyles.thin;
  navScroll.style.cssText = 'flex: 1; min-height: 0; overflow-y: auto;';
  navScroll.appendChild(navLinks);

  const themeToggle = document.createElement('div');
  themeToggle.className = navStyles.themeToggle;
  themeToggle.setAttribute('role', 'button');
  themeToggle.setAttribute('tabindex', '0');
  themeToggle.textContent = 'Toggle Theme';
  themeToggle.addEventListener('click', toggleTheme);
  themeToggle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTheme();
    }
  });

  return (
    <nav class={layoutStyles.sidebar} aria-label="Component navigation">
      <div class={navStyles.title}>Components</div>
      <div class={navStyles.subtitle}>{componentRegistry.length} themed components</div>
      {navScroll}
      {themeToggle}
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
