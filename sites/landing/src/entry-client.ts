import { hydrateIslands } from '@vertz/ui';

// Set dark theme on <html> so CSS variables resolve to dark values globally.
// ThemeProvider only sets data-theme on a nested <div>, but the theme base CSS
// applies body { background-color: var(--color-background) } at the :root scope.
document.documentElement.dataset.theme = 'dark';

const islandRegistry = {
  CopyButton: () => import('./components/copy-button'),
};

hydrateIslands(islandRegistry);

// Lightweight SPA navigation for internal links.
// The landing site uses islands mode (no router), so we intercept internal
// link clicks and swap the page content via fetch + DOMParser.
function setupNavigation() {
  document.addEventListener('click', async (e) => {
    const link = (e.target as Element).closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#') || link.hasAttribute('target')) {
      return;
    }

    e.preventDefault();
    if (href === window.location.pathname) return;

    await navigateTo(href);
  });

  window.addEventListener('popstate', () => {
    void navigateTo(window.location.pathname, false);
  });
}

async function navigateTo(href: string, pushState = true) {
  const res = await fetch(href);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const newApp = doc.getElementById('app');
  const currentApp = document.getElementById('app');
  if (newApp && currentApp) {
    currentApp.innerHTML = newApp.innerHTML;
    if (pushState) history.pushState(null, '', href);
    window.scrollTo(0, 0);
    hydrateIslands(islandRegistry);
  }
}

setupNavigation();
