import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const PORT = Number(process.env.PORT) || 4000;

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz — One command. Full stack. Running.',
  description: 'Define your schema once. It flows from database to API to UI. One type system, zero glue code. Powered by Bun.',
  favicon: '/public/logo.svg',
  stylesheets: [
    'https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
  ],
});

console.log(`
  Vertz Landing — Dev Server
  http://localhost:${PORT}
`);

await devServer.start();
