import { Database } from 'bun:sqlite';

// Verify Database is a constructor
if (typeof Database !== 'function') {
  throw new Error(`Expected Database to be a function, got ${typeof Database}`);
}

// Create in-memory database and perform basic operations
const db = new Database(':memory:');

// exec() for DDL
db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');

// prepare() + run() for inserts
const insert = db.prepare('INSERT INTO users (id, name) VALUES (?, ?)');
const r1 = insert.run(1, 'Alice');
const r2 = insert.run(2, 'Bob');

if (r1.changes !== 1) throw new Error(`Expected changes=1, got ${r1.changes}`);
if (r2.changes !== 1) throw new Error(`Expected changes=1, got ${r2.changes}`);

// prepare() + all() for queries
const select = db.prepare('SELECT * FROM users ORDER BY id');
const rows = select.all();

if (rows.length !== 2) throw new Error(`Expected 2 rows, got ${rows.length}`);
if (rows[0].id !== 1 || rows[0].name !== 'Alice') throw new Error(`Row 0 wrong: ${JSON.stringify(rows[0])}`);
if (rows[1].id !== 2 || rows[1].name !== 'Bob') throw new Error(`Row 1 wrong: ${JSON.stringify(rows[1])}`);

// prepare() + get() for single row
const row = db.prepare('SELECT * FROM users WHERE id = ?').get(1);
if (!row || row.name !== 'Alice') throw new Error(`get() wrong: ${JSON.stringify(row)}`);

const missing = db.prepare('SELECT * FROM users WHERE id = ?').get(999);
if (missing !== null) throw new Error(`Expected null for missing row, got ${JSON.stringify(missing)}`);

// db.run() shorthand returns { changes }
db.run('INSERT INTO users (id, name) VALUES (?, ?)', 3, 'Charlie');
const afterInsert = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
if (afterInsert.cnt !== 3) throw new Error(`Expected 3, got ${afterInsert.cnt}`);

// Parameterized queries with no params
const allRows = db.prepare('SELECT * FROM users').all();
if (allRows.length !== 3) throw new Error(`Expected 3 rows, got ${allRows.length}`);

// NULL round-trip
db.exec('CREATE TABLE nullable (id INTEGER, v TEXT)');
db.run('INSERT INTO nullable (id, v) VALUES (?, ?)', 1, null);
const nullRow = db.prepare('SELECT * FROM nullable').all();
if (nullRow[0].v !== null) throw new Error(`Expected null, got ${nullRow[0].v}`);

// PRAGMA query returns rows
db.exec('PRAGMA journal_mode = WAL');
const pragmaRows = db.prepare('PRAGMA journal_mode').all();
if (!('journal_mode' in pragmaRows[0])) throw new Error('PRAGMA missing journal_mode key');

// Close and verify error on reuse — prepare() should throw immediately
db.close();
let prepareError = false;
try {
  db.prepare('SELECT 1');
} catch (e) {
  prepareError = true;
}
if (!prepareError) throw new Error('Expected error from prepare() after close');

// exec() should also throw after close
let execError = false;
try {
  db.exec('SELECT 1');
} catch (e) {
  execError = true;
}
if (!execError) throw new Error('Expected error from exec() after close');

// run() should also throw after close
let runError = false;
try {
  db.run('SELECT 1');
} catch (e) {
  runError = true;
}
if (!runError) throw new Error('Expected error from run() after close');

// Double close should be idempotent (no error)
db.close();

console.log('bun:sqlite import test passed');
