import { createServer } from '@vertz/server';
import { webhooks } from './actions/webhooks/webhooks.service';
import { db } from './db';
import { todos } from './entities/todos/todos.entity';
import { env } from './env';

const app = createServer({
  basePath: '/api',
  entities: [todos],
  // @ts-expect-error service() returns narrowly-typed ServiceDefinition with injected entities; variance prevents direct widening
  services: [webhooks],
  db,
});

export default app;

if (import.meta.main) {
  app.listen(env.PORT).then((handle) => {
    console.log(`Entity Todo API running at http://localhost:${handle.port}/api`);
  });
}
