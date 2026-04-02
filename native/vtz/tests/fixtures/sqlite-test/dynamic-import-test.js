// Test dynamic import('bun:sqlite')
const mod = await import('bun:sqlite');

if (typeof mod.Database !== 'function') {
  throw new Error(`Expected Database function from dynamic import, got ${typeof mod.Database}`);
}

// Also test the default export
if (typeof mod.default !== 'function') {
  throw new Error(`Expected default export to be Database constructor, got ${typeof mod.default}`);
}

const db = new mod.Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER)');
db.run('INSERT INTO t (id) VALUES (?)', 42);
const rows = db.prepare('SELECT * FROM t').all();
if (rows[0].id !== 42) throw new Error(`Expected 42, got ${rows[0].id}`);
db.close();

console.log('dynamic import test passed');
