import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { generateCustomizationScript } from './customization-script';

const PORT = Number(process.env.PORT) || 4100;

// Blocking script that reads the theme cookie and sets data-theme on <html>
// BEFORE the browser paints — prevents dark→light or light→dark flash.
const THEME_INIT_SCRIPT = `<script>
(function(){
  var m = document.cookie.match(/(?:^|; )theme=(light|dark)/);
  document.documentElement.setAttribute('data-theme', m ? m[1] : 'dark');
})();
</script>`;

// Blocking script that reads the vertz-customization cookie and applies
// palette/radius/accent CSS variables on <html> before first paint.
// Must run AFTER THEME_INIT_SCRIPT (reads data-theme for light/dark detection).
const CUSTOMIZATION_INIT_SCRIPT = generateCustomizationScript();

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz UI — Components',
  headTags: `${THEME_INIT_SCRIPT}\n${CUSTOMIZATION_INIT_SCRIPT}`,
  watchDeps: true,
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
