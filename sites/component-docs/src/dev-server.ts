import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const PORT = Number(process.env.PORT) || 4100;

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Vertz UI — Components',
});

console.log(`
  Vertz Component Docs — Dev Server
  http://localhost:${PORT}
`);

await devServer.start();
