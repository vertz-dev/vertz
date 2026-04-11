// Test db.transaction() — commit on success, rollback on error
import { Database } from '@vertz/sqlite';

const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');

// Test 1: Successful transaction commits
const insertTwo = db.transaction(() => {
  db.run('INSERT INTO t (id, name) VALUES (?, ?)', 1, 'Alice');
  db.run('INSERT INTO t (id, name) VALUES (?, ?)', 2, 'Bob');
});
insertTwo();

let rows = db.prepare('SELECT * FROM t ORDER BY id').all();
if (rows.length !== 2) {
  throw new Error(`Expected 2 rows after commit, got ${rows.length}`);
}
if (rows[0].name !== 'Alice' || rows[1].name !== 'Bob') {
  throw new Error(`Wrong data: ${JSON.stringify(rows)}`);
}
console.log('transaction commit test passed');

// Test 2: Failing transaction rolls back
const failingTx = db.transaction(() => {
  db.run('INSERT INTO t (id, name) VALUES (?, ?)', 3, 'Carol');
  throw new Error('deliberate failure');
});

try {
  failingTx();
  throw new Error('Should have thrown');
} catch (e) {
  if (e.message !== 'deliberate failure') {
    throw new Error(`Wrong error: ${e.message}`);
  }
}

rows = db.prepare('SELECT * FROM t ORDER BY id').all();
if (rows.length !== 2) {
  throw new Error(`Expected 2 rows after rollback, got ${rows.length}`);
}
console.log('transaction rollback test passed');

// Test 3: Transaction returns callback result
db.exec('CREATE TABLE counter (n INTEGER)');
db.run('INSERT INTO counter (n) VALUES (?)', 0);

const getCount = db.transaction(() => {
  db.run('UPDATE counter SET n = n + 1');
  return db.prepare('SELECT n FROM counter').get().n;
});

const result = getCount();
if (result !== 1) {
  throw new Error(`Expected return value 1, got ${result}`);
}
console.log('transaction return value test passed');

db.close();
console.log('all transaction tests passed');
