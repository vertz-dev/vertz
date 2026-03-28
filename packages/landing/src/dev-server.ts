import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const PORT = Number(process.env.PORT) || 4000;

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz — One command. Full stack. Running.',
});

console.log(`
  Vertz Landing — Dev Server
  http://localhost:${PORT}
`);

await devServer.start();
