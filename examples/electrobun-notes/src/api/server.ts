import { createServer } from '@vertz/server';
import { createNotesDb } from './db';
import { notes } from './entities/notes.entity';

const app = createServer({
  basePath: '/api',
  entities: [notes],
  db: await createNotesDb(),
});

export default app;

if (import.meta.main) {
  const handle = await app.listen(3000);
  console.log(`Vertz Notes API running at http://localhost:${handle.port}/api`);
}
