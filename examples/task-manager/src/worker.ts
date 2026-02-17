/**
 * Cloudflare Worker entry point for Task Manager.
 * 
 * Uses @vertz/ui components with DOM shim for SSR.
 * The components return HTMLElement which we serialize to HTML.
 */

import { installDomShim } from '@vertz/ui-server/dom-shim';
installDomShim();

import { TaskListPage } from './pages/task-list';
import { CreateTaskPage } from './pages/create-task';
import { TaskDetailPage } from './pages/task-detail';
import { SettingsPage } from './pages/settings';
import { SettingsContext, createSettingsValue } from './lib/settings-context';
import { taskManagerTheme } from './styles/theme';

/**
 * Build CSS variables from theme.
 */
function buildThemeCss(theme: typeof taskManagerTheme): string {
  const rootVars: string[] = [];
  const darkVars: string[] = [];

  for (const [name, values] of Object.entries(theme.colors)) {
    for (const [key, value] of Object.entries(values)) {
      if (key === 'DEFAULT') {
        rootVars.push(`  --color-${name}: ${value};`);
      } else if (key === '_dark') {
        darkVars.push(`  --color-${name}: ${value};`);
      } else {
        rootVars.push(`  --color-${name}-${key}: ${value};`);
      }
    }
  }

  if (theme.spacing) {
    for (const [name, value] of Object.entries(theme.spacing)) {
      rootVars.push(`  --spacing-${name}: ${value};`);
    }
  }

  const blocks: string[] = [];
  if (rootVars.length > 0) blocks.push(`:root {\n${rootVars.join('\n')}\n}`);
  if (darkVars.length > 0) blocks.push(`[data-theme="dark"] {\n${darkVars.join('\n')}\n}`);
  return blocks.join('\n');
}

const globalStyles = `
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  font-family: system-ui, -apple-system, sans-serif;
  background-color: var(--color-background, #f9fafb);
  color: var(--color-foreground, #111827);
  min-height: 100vh;
  line-height: 1.5;
}
a {
  text-decoration: none;
  color: inherit;
}
`;

/**
 * Render a page component to HTML string.
 */
function renderPage(
  pageFn: () => HTMLElement,
  url: string,
): string {
  const settings = createSettingsValue();
  let pageHtml = '';
  
  // Render the page within SettingsContext
  SettingsContext.Provider(settings, () => {
    const page = pageFn();
    pageHtml = page.outerHTML;
  });

  const themeCss = buildThemeCss(taskManagerTheme);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Task Manager</title>
  <style>${themeCss}</style>
  <style>${globalStyles}</style>
</head>
<body>
  <div id="app">${pageHtml}</div>
  <script>
    window.__SSR_URL__ = "${url}";
  </script>
</body>
</html>`;
}

/**
 * Get the page content and status for a given URL.
 */
function getPage(url: string): { html: string; status: number } {
  const urlObj = new URL(url);
  const path = urlObj.pathname;

  try {
    if (path === '/' || path === '') {
      return { html: renderPage(() => TaskListPage({ navigate: () => {} }), url), status: 200 };
    }
    if (path === '/tasks/new') {
      return { html: renderPage(() => CreateTaskPage({ navigate: () => {} }), url), status: 200 };
    }
    if (path.startsWith('/tasks/')) {
      const taskId = path.split('/tasks/')[1];
      return { html: renderPage(() => TaskDetailPage({ taskId, navigate: () => {} }), url), status: 200 };
    }
    if (path === '/settings') {
      return { html: renderPage(() => SettingsPage({ navigate: () => {} }), url), status: 200 };
    }
  } catch (e) {
    return { 
      html: `<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Error</h1><p>${e}</p></body></html>`, 
      status: 500 
    };
  }

  // 404
  return {
    html: `<!DOCTYPE html>
<html>
<head><title>404 - Not Found</title></head>
<body>
  <h1>404 - Not Found</h1>
  <p>The page ${path} was not found.</p>
  <a href="/">Go home</a>
</body>
</html>`,
    status: 404,
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    const { html, status } = getPage(request.url);
    
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  },
};
