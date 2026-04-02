import { Database } from 'bun:sqlite';

// File-based database test — path is passed via globalThis.__test_db_path
const dbPath = globalThis.__test_db_path;
if (!dbPath) throw new Error('__test_db_path not set');

// Create and populate
const db1 = new Database(dbPath);
db1.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)');
db1.run('INSERT OR REPLACE INTO t (id, v) VALUES (?, ?)', 1, 'hello');
db1.close();

// Reopen and verify persistence
const db2 = new Database(dbPath);
const rows = db2.prepare('SELECT * FROM t WHERE id = ?').all(1);
if (rows.length !== 1) throw new Error(`Expected 1 row, got ${rows.length}`);
if (rows[0].v !== 'hello') throw new Error(`Expected 'hello', got ${rows[0].v}`);

// WAL mode
db2.exec('PRAGMA journal_mode = WAL');
const pragma = db2.prepare('PRAGMA journal_mode').all();
if (pragma[0].journal_mode !== 'wal') throw new Error(`Expected wal, got ${pragma[0].journal_mode}`);

db2.close();

console.log('file-db test passed');
