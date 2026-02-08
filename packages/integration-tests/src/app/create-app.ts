import { createApp } from '@vertz/core';
import { authMiddleware } from './middleware/auth';
import { createTodosModule } from './modules/todos';
import { createUsersModule } from './modules/users';

export interface TestServer {
  handler: (request: Request) => Promise<Response>;
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  stop: () => void;
}

export function createIntegrationApp(): TestServer {
  const { module: usersModule, userService } = createUsersModule();
  const { module: todosModule } = createTodosModule(userService);

  const app = createApp({ basePath: '/api', cors: { origins: true } })
    .middlewares([authMiddleware])
    .register(usersModule)
    .register(todosModule);

  const handler = app.handler;

  return {
    handler,
    fetch: (path, init) => handler(new Request(`http://localhost${path}`, init)),
    stop: () => {},
  };
}
