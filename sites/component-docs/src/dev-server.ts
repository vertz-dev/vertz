import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const PORT = Number(process.env.PORT) || 4100;

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
});

console.log(`
  Vertz Component Docs — Dev Server
  http://localhost:${PORT}
`);

await devServer.start();
