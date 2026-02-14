/**
 * Client entry point for SSR hydration.
 * 
 * Attaches event listeners and reactive effects to server-rendered HTML.
 * 
 * For now, this does "rehydration by replacement" — clearing the server HTML
 * and mounting a fresh client version. True hydration (matching and attaching
 * to existing DOM) is a Phase 2 enhancement.
 */

import { App } from './app';

console.log('[Client] Hydration starting...');

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('App root element not found — SSR HTML may be missing #app');
}

// Mount the client app
// The client JSX runtime (jsx-runtime.ts) is active here,
// so App() returns an HTMLElement
const app = App();

// Clear server HTML and mount client version
// In true hydration, we would match the tree and attach to existing nodes
appRoot.innerHTML = '';
appRoot.appendChild(app);

console.log('[Client] Hydration complete');
