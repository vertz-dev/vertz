import { createSqliteAdapter } from '@vertz/db/sqlite';
import { createServer } from '@vertz/server';
import { contacts } from './entities';
import { contactsTable } from './schema';

const PORT = Number(process.env.PORT) || 3000;

const db = await createSqliteAdapter({
  schema: contactsTable,
  migrations: { autoApply: true },
});

const app = createServer({
  entities: [contacts],
  db,
});

app.listen(PORT);
