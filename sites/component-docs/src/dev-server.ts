import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { initHighlighter } from './lib/highlighter';

const PORT = Number(process.env.PORT) || 4100;

// Initialize Shiki before the server starts so syntax highlighting
// is available during SSR — code blocks are pre-rendered with full
// highlighting, eliminating the flash of unstyled code on first paint.
await initHighlighter();

// Blocking script that reads the theme cookie and sets data-theme on <html>
// BEFORE the browser paints — prevents dark→light or light→dark flash.
const THEME_INIT_SCRIPT = `<script>
(function(){
  var m = document.cookie.match(/(?:^|; )theme=(light|dark)/);
  document.documentElement.setAttribute('data-theme', m ? m[1] : 'dark');
})();
</script>`;

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz UI — Components',
  headTags: THEME_INIT_SCRIPT,
  themeFromRequest: (request) => {
    const match = request.headers.get('cookie')?.match(/(?:^|; )theme=(light|dark)/);
    return match?.[1] ?? null;
  },
});

console.log(`
  Vertz Component Docs — Dev Server
  http://localhost:${PORT}
`);

await devServer.start();
