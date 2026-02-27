import { createServer } from '@vertz/server';
import { createTasksDb } from './db';
import { tasks } from './entities';

const tasksDbAdapter = createTasksDb();

const app = createServer({
  basePath: '/api',
  entities: [tasks],
  db: tasksDbAdapter,
});

export default app;

if (import.meta.main) {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT).then((handle) => {
    console.log(`Task Manager API running at http://localhost:${handle.port}/api`);
  });
}
