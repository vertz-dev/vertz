import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const PORT = Number(process.env.PORT) || 4000;

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz — One command. Full stack. Running.',
  headTags: [
    '<link rel="preload" href="/public/fonts/dm-sans-latin.woff2" as="font" type="font/woff2" crossorigin />',
    '<link rel="preload" href="/public/fonts/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossorigin />',
  ].join('\n    '),
});

console.log(`
  Vertz Landing — Dev Server
  http://localhost:${PORT}
`);

await devServer.start();
