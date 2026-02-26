import { createServer } from '@vertz/server';
import { createTodosDb } from './db';
import { todos } from './entities';

const todosDbAdapter = createTodosDb();

const app = createServer({
  basePath: '/api',
  entities: [todos],
  db: todosDbAdapter,
});

export default app;

if (import.meta.main) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT).then((handle) => {
    console.log(`Entity Todo API running at http://localhost:${handle.port}/api`);
  });
}
