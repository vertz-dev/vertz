import {
  getInjectedCSS,
  globalCss,
  ThemeProvider,
} from '@vertz/ui';
import type { ComponentEntry } from './demos';
import {
  categoryLabels,
  categoryOrder,
  componentRegistry,
  groupByCategory,
} from './demos';
import { appRouter, Link } from './router';
import { layoutStyles, navStyles, scrollStyles } from './styles/catalog';
import { demoStyles, homeStyles } from './styles/catalog';
import { catalogTheme, themeGlobals, themeStyles } from './styles/theme';

const appGlobals = globalCss({
  a: {
    textDecoration: 'none',
    color: 'inherit',
  },
});

// Collect all component CSS from theme styles
const componentCss = Object.values(themeStyles)
  .map((s: any) => s.css)
  .filter(Boolean);

export { getInjectedCSS };
export const theme = catalogTheme;
export const styles = [themeGlobals.css, appGlobals.css, scrollStyles.css, ...componentCss];

/** Build the home page content */
function renderHome(): HTMLElement {
  const grouped = groupByCategory(componentRegistry);
  const el = document.createElement('div');

  const title = document.createElement('h1');
  title.className = homeStyles.title;
  title.textContent = 'Component Catalog';

  const subtitle = document.createElement('p');
  subtitle.className = homeStyles.subtitle;
  subtitle.textContent = `${componentRegistry.length} themed components from @vertz/theme-shadcn`;

  const grid = document.createElement('div');
  grid.className = homeStyles.grid;

  for (const cat of categoryOrder) {
    const entries = grouped.get(cat) ?? [];
    const card = document.createElement('div');
    card.className = homeStyles.categoryCard;
    card.addEventListener('click', () => {
      if (entries.length > 0) {
        appRouter.navigate(`/${entries[0].slug}` as any);
      }
    });

    const name = document.createElement('div');
    name.className = homeStyles.categoryName;
    name.textContent = categoryLabels[cat];

    const count = document.createElement('div');
    count.className = homeStyles.categoryCount;
    count.textContent = `${entries.length} components`;

    card.append(name, count);
    grid.append(card);
  }

  el.append(title, subtitle, grid);
  return el;
}

/** Build a demo page */
function renderDemo(entry: ComponentEntry): HTMLElement {
  const el = document.createElement('div');

  const label = document.createElement('div');
  label.className = demoStyles.demoLabel;
  label.textContent = entry.name;

  const desc = document.createElement('div');
  desc.className = demoStyles.demoDescription;
  desc.textContent = entry.description;

  const box = document.createElement('div');
  box.className = demoStyles.demoBox;
  box.append(entry.demo());

  el.append(label, desc, box);
  return el;
}

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
    Link({ href: '/', children: 'Overview', className: navStyles.navItem, activeClass: navStyles.navItemActive }),
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
  // Build a lookup of slug -> entry
  const entryMap = new Map<string, ComponentEntry>();
  for (const entry of componentRegistry) {
    entryMap.set(entry.slug, entry);
  }

  // Main content area with overflow scroll
  const mainEl = document.createElement('div');
  mainEl.className = `${layoutStyles.main} ${scrollStyles.thin}`;
  mainEl.style.cssText = 'overflow-y: auto;';

  function renderRoute(path: string) {
    mainEl.innerHTML = '';
    if (path === '/') {
      mainEl.append(renderHome());
    } else {
      const slug = path.slice(1); // remove leading /
      const entry = entryMap.get(slug);
      if (entry) {
        mainEl.append(renderDemo(entry));
      } else {
        const notFound = document.createElement('div');
        notFound.textContent = 'Page not found';
        mainEl.append(notFound);
      }
    }
  }

  // Initial render
  renderRoute(window.location.pathname);

  // Listen for route changes
  const originalNavigate = appRouter.navigate.bind(appRouter);
  appRouter.navigate = ((url: string) => {
    originalNavigate(url);
    renderRoute(url);
  }) as typeof appRouter.navigate;

  // Also handle popstate (back/forward)
  window.addEventListener('popstate', () => {
    renderRoute(window.location.pathname);
  });

  return (
    <div>
      <ThemeProvider theme="light">
        <div class={layoutStyles.shell}>
          <Sidebar />
          {mainEl}
        </div>
      </ThemeProvider>
    </div>
  );
}
