import { createDbProvider } from '@vertz/db';
import { createServer } from '@vertz/server';
import { contacts } from './entities';
import { contactsTable } from './schema';

const PORT = Number(process.env.PORT) || 3000;

const db = await createDbProvider({
  dialect: 'sqlite',
  schema: contactsTable,
  migrations: { autoApply: true },
});

const app = createServer({
  entities: [contacts],
  _entityDbFactory: () => db,
});

app.listen(PORT);
