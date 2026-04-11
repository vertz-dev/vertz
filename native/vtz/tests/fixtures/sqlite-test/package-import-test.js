// Test the @vertz/sqlite npm package import (intercepted by runtime)
import { Database, Statement } from '@vertz/sqlite';

const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
db.run('INSERT INTO t (id, v) VALUES (?, ?)', 1, 'works');

const rows = db.prepare('SELECT * FROM t').all();
if (rows.length !== 1 || rows[0].v !== 'works') {
  throw new Error(`@vertz/sqlite import failed: ${JSON.stringify(rows)}`);
}

// Verify Statement is exported
if (typeof Statement !== 'function') {
  throw new Error('Statement is not exported as a function');
}

db.close();
console.log('@vertz/sqlite package import test passed');
