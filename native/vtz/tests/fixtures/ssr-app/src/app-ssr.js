// Minimal SSR module for POC testing.
// Exports match the SSRModule interface from @vertz/ui-server.
// Uses plain DOM (no @vertz/ui reactivity) to keep the test focused
// on verifying ssrRenderSinglePass works in deno_core V8.

export function App() {
  const div = document.createElement('div');
  div.setAttribute('data-testid', 'app-root');

  const h1 = document.createElement('h1');
  h1.appendChild(document.createTextNode('Hello SSR'));
  div.appendChild(h1);

  const p = document.createElement('p');
  p.appendChild(document.createTextNode('Rendered by ssrRenderSinglePass'));
  div.appendChild(p);

  // Return the root element — the SSR engine serializes the return value
  return div;
}

export const styles = ['body { margin: 0; }'];
