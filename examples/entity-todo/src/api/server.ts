import { createServer } from '@vertz/server';
import { webhooks } from './actions/webhooks/webhooks.service';
import { createTodosDb } from './db';
import { todos } from './entities/todos/todos.entity';
import { env } from './env';

const todosDbAdapter = createTodosDb();

const app = createServer({
  basePath: '/api',
  entities: [todos],
  services: [webhooks],
  db: todosDbAdapter,
});

export default app;

if (import.meta.main) {
  app.listen(env.PORT).then((handle) => {
    console.log(`Entity Todo API running at http://localhost:${handle.port}/api`);
  });
}
