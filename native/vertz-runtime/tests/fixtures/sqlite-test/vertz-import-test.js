// Test the canonical vertz:sqlite import
import { Database } from 'vertz:sqlite';

const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)');
db.run('INSERT INTO t (id, v) VALUES (?, ?)', 1, 'works');

const rows = db.prepare('SELECT * FROM t').all();
if (rows.length !== 1 || rows[0].v !== 'works') {
  throw new Error(`vertz:sqlite import failed: ${JSON.stringify(rows)}`);
}

db.close();
console.log('vertz:sqlite canonical import test passed');
