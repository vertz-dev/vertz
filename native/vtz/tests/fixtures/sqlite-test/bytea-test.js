import { Database } from '@vertz/sqlite';

const db = new Database(':memory:');
db.exec('CREATE TABLE blobs (id INTEGER PRIMARY KEY, data BLOB)');

// ---------------------------------------------------------------
// Round-trip a small Uint8Array
// ---------------------------------------------------------------
const small = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff]);
db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(1, small);

const smallRow = db.prepare('SELECT data FROM blobs WHERE id = ?').get(1);
if (!(smallRow.data instanceof Uint8Array)) {
  throw new Error(`Expected Uint8Array, got ${typeof smallRow.data} / ${smallRow.data?.constructor?.name}`);
}
if (smallRow.data.length !== small.length) {
  throw new Error(`Expected length ${small.length}, got ${smallRow.data.length}`);
}
for (let i = 0; i < small.length; i++) {
  if (smallRow.data[i] !== small[i]) {
    throw new Error(`Byte mismatch at ${i}: expected ${small[i]}, got ${smallRow.data[i]}`);
  }
}

// ---------------------------------------------------------------
// Round-trip an empty Uint8Array
// ---------------------------------------------------------------
db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(2, new Uint8Array(0));
const emptyRow = db.prepare('SELECT data FROM blobs WHERE id = ?').get(2);
if (!(emptyRow.data instanceof Uint8Array) || emptyRow.data.length !== 0) {
  throw new Error(`Empty blob round-trip failed: ${emptyRow.data}`);
}

// ---------------------------------------------------------------
// Round-trip a ~1 MB Uint8Array
// ---------------------------------------------------------------
const size = 1024 * 1024;
const big = new Uint8Array(size);
for (let i = 0; i < size; i++) big[i] = i & 0xff;
db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(3, big);
const bigRow = db.prepare('SELECT data FROM blobs WHERE id = ?').get(3);
if (!(bigRow.data instanceof Uint8Array) || bigRow.data.length !== size) {
  throw new Error(`Large blob round-trip failed: length ${bigRow.data?.length}`);
}
for (let i = 0; i < size; i += 997) {
  if (bigRow.data[i] !== (i & 0xff)) {
    throw new Error(`Large blob byte mismatch at ${i}`);
  }
}

// ---------------------------------------------------------------
// .all() returns Uint8Array cells
// ---------------------------------------------------------------
const rows = db.prepare('SELECT id, data FROM blobs WHERE id IN (?, ?) ORDER BY id').all(1, 2);
if (rows.length !== 2) throw new Error(`Expected 2 rows, got ${rows.length}`);
if (!(rows[0].data instanceof Uint8Array)) throw new Error('rows[0].data not Uint8Array');
if (!(rows[1].data instanceof Uint8Array)) throw new Error('rows[1].data not Uint8Array');

// ---------------------------------------------------------------
// Pre-existing scalar params still work alongside bytea
// ---------------------------------------------------------------
db.exec('CREATE TABLE mixed (id INTEGER PRIMARY KEY, label TEXT, active INTEGER, ratio REAL, payload BLOB)');
db.prepare('INSERT INTO mixed (id, label, active, ratio, payload) VALUES (?, ?, ?, ?, ?)').run(
  1,
  'hello',
  true,
  1.5,
  new Uint8Array([1, 2, 3]),
);
const mixed = db.prepare('SELECT * FROM mixed WHERE id = ?').get(1);
if (mixed.label !== 'hello') throw new Error(`Expected "hello", got ${mixed.label}`);
if (mixed.active !== 1) throw new Error(`Expected active=1, got ${mixed.active}`);
if (mixed.ratio !== 1.5) throw new Error(`Expected ratio=1.5, got ${mixed.ratio}`);
if (!(mixed.payload instanceof Uint8Array) || mixed.payload.length !== 3) {
  throw new Error(`Mixed payload not Uint8Array[3]: ${mixed.payload}`);
}

// ---------------------------------------------------------------
// NULL blob column reads back as null, not an empty Uint8Array
// ---------------------------------------------------------------
db.prepare('INSERT INTO blobs (id, data) VALUES (?, ?)').run(4, null);
const nullRow = db.prepare('SELECT data FROM blobs WHERE id = ?').get(4);
if (nullRow.data !== null) throw new Error(`Expected null, got ${nullRow.data}`);

db.close();
console.log('bytea round-trip test passed');
