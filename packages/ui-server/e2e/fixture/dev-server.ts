// Internal test fixture — real apps use `@vertz/cli dev` or `@vertz/ui-server`
import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';

const port = Number(process.env.PORT ?? 14321);
const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port,
  host: 'localhost',
  projectRoot: import.meta.dirname,
  ssrModule: true,
  title: 'HMR E2E Fixture',
  logRequests: false,
});

await devServer.start();
console.log(`[fixture] ready on http://localhost:${port}`);
