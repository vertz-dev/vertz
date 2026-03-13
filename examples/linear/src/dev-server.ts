/**
 * Linear Clone — Development Server
 *
 * Uses createBunDevServer for SSR + HMR.
 * API routes compose auth + entity handlers.
 * Auth tables are initialized on startup.
 */

import { createBunDevServer } from '@vertz/ui-server/bun-dev-server';
import { app } from './api/server';

const PORT = Number(process.env.PORT) || 3000;

// Initialize auth tables (creates auth_users, oauth_accounts, sessions tables)
await app.initialize();

const devServer = createBunDevServer({
  entry: './src/app.tsx',
  clientEntry: './src/entry-client.ts',
  port: PORT,
  ssrModule: true,
  title: 'Linear Clone',
  sessionResolver: app.auth.resolveSessionForSSR,
  apiHandler: async (req: Request) => {
    const url = new URL(req.url);

    // Auth routes: /api/auth/*
    if (url.pathname.startsWith('/api/auth')) {
      return app.auth.handler(req);
    }

    // Entity routes: /api/*
    return app.handler(req);
  },
});

console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   Linear Clone — Dev Server (SSR+HMR)                     ║
║                                                            ║
║   Local:     http://localhost:${PORT}                             ║
║                                                            ║
║   OAuth:                                                   ║
║   • GET  /api/auth/oauth/github          Start OAuth flow  ║
║   • GET  /api/auth/oauth/github/callback OAuth callback    ║
║   • GET  /api/auth/session               Get session       ║
║   • POST /api/auth/signout               Sign out          ║
║                                                            ║
║   Entity API:                                              ║
║   • GET  /api/users                      List users        ║
║   • GET  /api/users/:id                  Get user          ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);

await devServer.start();
