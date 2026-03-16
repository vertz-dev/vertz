import { createDb } from '@vertz/db';
import { createServer } from '@vertz/server';
import { contacts } from './entities';
import { contactsModel } from './schema';

const PORT = Number(process.env.PORT) || 3000;

const db = createDb({
  models: { contacts: contactsModel },
  dialect: 'sqlite',
  path: '.vertz/data/app.db',
  migrations: { autoApply: true },
});

const app = createServer({
  entities: [contacts],
  db,
});

app.listen(PORT);
