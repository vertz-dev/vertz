import { createServer } from '@vertz/server';
import { todos } from './entities';
import { todosDbAdapter } from './db';

const PORT = Number(process.env.PORT) || 3000;

const app = createServer({
  basePath: '/api',
  entities: [todos],
  _entityDbFactory: () => todosDbAdapter,
});

app.listen(PORT).then((handle) => {
  console.log(`Entity Todo API running at http://localhost:${handle.port}/api`);
  console.log('');
  console.log('Endpoints (auto-generated from entity):');
  console.log('  GET    /api/todos');
  console.log('  GET    /api/todos/:id');
  console.log('  POST   /api/todos');
  console.log('  PATCH  /api/todos/:id');
  console.log('  DELETE /api/todos/:id');
});
