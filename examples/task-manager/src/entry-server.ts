/**
 * Server entry point for SSR.
 *
 * Renders the task-manager app to HTML using @vertz/ui-server.
 * This runs in Node.js/Bun during server-side rendering.
 */

import { renderToStream, type VNode } from '@vertz/ui-server';

/**
 * Render the app to an HTML stream for the given URL.
 *
 * @param url - The requested URL path
 * @returns ReadableStream of HTML chunks
 */
export async function render(url: string): Promise<ReadableStream<Uint8Array>> {
  // For now, create a simple VNode tree
  // TODO: Integrate with the actual app router and components
  const appContent: VNode = {
    tag: 'div',
    attrs: { 'data-testid': 'app-root' },
    children: [
      {
        tag: 'div',
        attrs: { class: 'shell' },
        children: [
          {
            tag: 'nav',
            attrs: { class: 'sidebar', 'aria-label': 'Main navigation' },
            children: [
              {
                tag: 'div',
                attrs: { class: 'nav-title' },
                children: ['Task Manager'],
              },
              {
                tag: 'div',
                attrs: { class: 'nav-list' },
                children: [
                  {
                    tag: 'a',
                    attrs: { href: '/', class: 'nav-item' },
                    children: ['All Tasks'],
                  },
                  {
                    tag: 'a',
                    attrs: { href: '/tasks/new', class: 'nav-item' },
                    children: ['Create Task'],
                  },
                  {
                    tag: 'a',
                    attrs: { href: '/settings', class: 'nav-item' },
                    children: ['Settings'],
                  },
                ],
              },
            ],
          },
          {
            tag: 'main',
            attrs: { class: 'main', 'data-testid': 'main-content' },
            children: [renderPageForUrl(url)],
          },
        ],
      },
    ],
  };

  return renderToStream(appContent);
}

/**
 * Render the appropriate page component based on the URL.
 */
function renderPageForUrl(url: string): VNode {
  const path = new URL(url, 'http://localhost').pathname;

  if (path === '/settings') {
    return {
      tag: 'div',
      attrs: { class: 'page' },
      children: [
        {
          tag: 'h1',
          attrs: {},
          children: ['Settings'],
        },
        {
          tag: 'div',
          attrs: { class: 'settings-form' },
          children: [
            {
              tag: 'label',
              attrs: {},
              children: ['Theme'],
            },
          ],
        },
      ],
    };
  }

  // Default: task list page
  return {
    tag: 'div',
    attrs: { class: 'page' },
    children: [
      {
        tag: 'h1',
        attrs: {},
        children: ['All Tasks'],
      },
      {
        tag: 'div',
        attrs: { class: 'task-list' },
        children: ['Tasks will appear here'],
      },
    ],
  };
}

/**
 * Render the full HTML document with the app content.
 *
 * @param url - The requested URL path
 * @returns Promise<string> - Complete HTML document
 */
export async function renderToString(url: string): Promise<string> {
  const appStream = await render(url);
  const reader = appStream.getReader();
  const decoder = new TextDecoder();
  let html = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    html += decoder.decode(value, { stream: true });
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Task Manager — @vertz/ui demo</title>
  </head>
  <body>
    <div id="app">${html}</div>
    <script type="module" src="/src/entry-client.ts"></script>
  </body>
</html>`;
}
