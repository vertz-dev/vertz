/**
 * Post-build: strip SSR content from index.html so the SPA fallback
 * serves a clean shell. Without this, non-pre-rendered routes get
 * hydration mismatches because the SSR HTML was rendered for "/" but
 * the client router renders a different route component.
 */
const file = 'dist/client/index.html';
const html = await Bun.file(file).text();
const stripped = html.replace(/<div id="app">[\s\S]*?<\/div>/, '<div id="app"></div>');
await Bun.write(file, stripped);
