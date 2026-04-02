import { Database } from 'bun:sqlite';

// ---------------------------------------------------------------
// Pattern 1: test-db-helper.ts queryFn bridge
// The @vertz/db tests create a queryFn that bridges bun:sqlite
// to the framework's DatabaseClient interface.
// ---------------------------------------------------------------

function createQueryFn(rawDb) {
  return function queryFn(sql, params) {
    // Convert $1, $2 style to ? style (matching real test-db-helper)
    let paramIndex = 0;
    const sqliteParams = [];
    const sqliteSql = sql.replace(/\$(\d+)/g, (_match, num) => {
      const idx = parseInt(num, 10) - 1;
      sqliteParams[paramIndex] = params[idx];
      paramIndex++;
      return '?';
    });

    const stmt = rawDb.prepare(sqliteSql);
    const isSelect = sqliteSql.trimStart().toUpperCase().startsWith('SELECT')
      || sqliteSql.trimStart().toUpperCase().startsWith('PRAGMA');
    const isReturning = sqliteSql.toUpperCase().includes('RETURNING');

    if (isSelect || isReturning) {
      const rows = stmt.all(...sqliteParams);
      return { rows, rowCount: rows.length };
    } else {
      const info = stmt.run(...sqliteParams);
      return { rows: [], rowCount: info.changes };
    }
  };
}

// Test the queryFn bridge
const rawDb = new Database(':memory:');
const queryFn = createQueryFn(rawDb);

// DDL via queryFn
queryFn('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)', []);

// INSERT via queryFn with $N params
queryFn('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [1, 'Alice', 'alice@test.com']);
queryFn('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [2, 'Bob', 'bob@test.com']);

// SELECT via queryFn
const result = queryFn('SELECT * FROM users ORDER BY id', []);
if (result.rows.length !== 2) throw new Error(`Expected 2 rows, got ${result.rows.length}`);
if (result.rows[0].name !== 'Alice') throw new Error(`Expected Alice, got ${result.rows[0].name}`);
if (result.rows[1].name !== 'Bob') throw new Error(`Expected Bob, got ${result.rows[1].name}`);

// INSERT with RETURNING via queryFn
queryFn('CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT)', []);
const insertResult = queryFn('INSERT INTO items (label) VALUES ($1) RETURNING *', ['Widget']);
if (insertResult.rows.length !== 1) throw new Error(`Expected 1 row from RETURNING, got ${insertResult.rows.length}`);
if (insertResult.rows[0].label !== 'Widget') throw new Error(`Expected Widget, got ${insertResult.rows[0].label}`);

console.log('queryFn bridge test passed');

// ---------------------------------------------------------------
// Pattern 2: Transaction control via db.exec()
// ---------------------------------------------------------------

rawDb.exec('BEGIN');
queryFn('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [3, 'Charlie', 'charlie@test.com']);
rawDb.exec('COMMIT');

const afterCommit = queryFn('SELECT * FROM users', []);
if (afterCommit.rows.length !== 3) throw new Error(`Expected 3 after commit, got ${afterCommit.rows.length}`);

// Rollback
rawDb.exec('BEGIN');
queryFn('INSERT INTO users (id, name, email) VALUES ($1, $2, $3)', [4, 'Diana', 'diana@test.com']);
rawDb.exec('ROLLBACK');

const afterRollback = queryFn('SELECT * FROM users', []);
if (afterRollback.rows.length !== 3) throw new Error(`Expected 3 after rollback, got ${afterRollback.rows.length}`);

console.log('transaction control test passed');

// ---------------------------------------------------------------
// Pattern 3: Introspect pattern — PRAGMA table_info
// ---------------------------------------------------------------

const tableInfo = rawDb.prepare('PRAGMA table_info(users)').all();
if (tableInfo.length !== 3) throw new Error(`Expected 3 columns, got ${tableInfo.length}`);
const colNames = tableInfo.map(c => c.name);
if (!colNames.includes('id')) throw new Error('Missing id column');
if (!colNames.includes('name')) throw new Error('Missing name column');
if (!colNames.includes('email')) throw new Error('Missing email column');

console.log('introspect pattern test passed');

// ---------------------------------------------------------------
// Pattern 4: stmt.get() — auth-initialize.test.ts pattern
// ---------------------------------------------------------------

rawDb.run('CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER, token TEXT)');
rawDb.run('INSERT INTO sessions (id, user_id, token) VALUES (?, ?, ?)', 'sess-1', 1, 'abc123');

const session = rawDb.prepare('SELECT * FROM sessions WHERE id = ?').get('sess-1');
if (!session) throw new Error('Expected session row');
if (session.token !== 'abc123') throw new Error(`Expected abc123, got ${session.token}`);

const noSession = rawDb.prepare('SELECT * FROM sessions WHERE id = ?').get('nonexistent');
if (noSession !== null && noSession !== undefined) {
  throw new Error(`Expected null/undefined for missing session, got ${JSON.stringify(noSession)}`);
}

console.log('stmt.get() pattern test passed');

// ---------------------------------------------------------------
// Pattern 5: db.run() for DDL (introspect.test.ts pattern)
// ---------------------------------------------------------------

rawDb.run('CREATE TABLE tasks (id INTEGER PRIMARY KEY, title TEXT, status TEXT DEFAULT "todo")');
rawDb.run('INSERT INTO tasks (id, title) VALUES (?, ?)', 1, 'Test task');

const tasks = rawDb.prepare('SELECT * FROM tasks').all();
if (tasks.length !== 1) throw new Error(`Expected 1 task, got ${tasks.length}`);
if (tasks[0].status !== 'todo') throw new Error(`Expected todo default, got ${tasks[0].status}`);

console.log('db.run() DDL pattern test passed');

rawDb.close();

console.log('db-integration test passed');
