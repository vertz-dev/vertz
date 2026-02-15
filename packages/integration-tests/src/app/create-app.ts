import { createServer } from '@vertz/server';
import type { RuntimeAdapter } from '../runtime-adapters/types';
import { authMiddleware } from './middleware/auth';
import { createTodosModule } from './modules/todos';
import { createUsersModule } from './modules/users';

export interface TestServer {
  handler: (request: Request) => Promise<Response>;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => void | Promise<void>;
  port: number;
  url: string;
}

export function createIntegrationApp(): TestServer {
  const { module: usersModule, userService } = createUsersModule();
  const { module: todosModule } = createTodosModule(userService);

  const app = createServer({ basePath: '/api', cors: { origins: true } })
    .middlewares([authMiddleware])
    .register(usersModule)
    .register(todosModule);

  const handler = app.handler;

  return {
    handler,
    fetch: (path, init) => handler(new Request(`http://localhost${path}`, init)),
    stop: () => {},
    port: 0,
    url: 'http://localhost',
  };
}

export async function createIntegrationServer(adapter: RuntimeAdapter): Promise<TestServer> {
  const { module: usersModule, userService } = createUsersModule();
  const { module: todosModule } = createTodosModule(userService);

  const app = createServer({ basePath: '/api', cors: { origins: true } })
    .middlewares([authMiddleware])
    .register(usersModule)
    .register(todosModule);

  const handler = app.handler;
  const handle = await adapter.createServer(handler);

  return {
    handler,
    fetch: (path, init) => globalThis.fetch(`${handle.url}${path}`, init),
    stop: () => handle.close(),
    port: handle.port,
    url: handle.url,
  };
}
