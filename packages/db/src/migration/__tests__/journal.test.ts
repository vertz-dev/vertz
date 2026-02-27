import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JournalEntry } from '../journal';
import {
  addJournalEntry,
  createJournal,
  detectCollisions,
  readJournal,
  writeJournal,
} from '../journal';

describe('createJournal', () => {
  it('returns a journal with version 1 and empty migrations array', () => {
    const journal = createJournal();

    expect(journal.version).toBe(1);
    expect(journal.migrations).toEqual([]);
  });
});

describe('addJournalEntry', () => {
  const entry: JournalEntry = {
    name: '0001_initial_schema.sql',
    description: 'Initial schema',
    createdAt: '2026-02-27T00:00:00.000Z',
    checksum: 'abc123',
  };

  it('adds entry to empty journal', () => {
    const journal = createJournal();
    const updated = addJournalEntry(journal, entry);

    expect(updated.migrations).toHaveLength(1);
    expect(updated.migrations[0]).toEqual(entry);
  });

  it('is immutable — original journal unchanged', () => {
    const journal = createJournal();
    const second: JournalEntry = {
      name: '0002_add_users.sql',
      description: 'Add users',
      createdAt: '2026-02-27T01:00:00.000Z',
      checksum: 'def456',
    };

    const withFirst = addJournalEntry(journal, entry);
    const withBoth = addJournalEntry(withFirst, second);

    expect(journal.migrations).toHaveLength(0);
    expect(withFirst.migrations).toHaveLength(1);
    expect(withBoth.migrations).toHaveLength(2);
    expect(withBoth.migrations[0]).toEqual(entry);
    expect(withBoth.migrations[1]).toEqual(second);
  });
});

describe('readJournal', () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vertz-journal-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('returns empty journal when file does not exist', async () => {
    const journal = await readJournal(join(tempDir, '_journal.json'));

    expect(journal.version).toBe(1);
    expect(journal.migrations).toEqual([]);
  });

  it('reads and parses valid journal file', async () => {
    const journalPath = join(tempDir, '_journal.json');
    const data = {
      version: 1,
      migrations: [
        {
          name: '0001_initial_schema.sql',
          description: 'Initial schema',
          createdAt: '2026-02-27T00:00:00.000Z',
          checksum: 'abc123',
        },
      ],
    };
    await writeFile(journalPath, JSON.stringify(data, null, 2));

    const journal = await readJournal(journalPath);

    expect(journal.version).toBe(1);
    expect(journal.migrations).toHaveLength(1);
    expect(journal.migrations[0]?.name).toBe('0001_initial_schema.sql');
  });

  it('throws on invalid JSON', async () => {
    const journalPath = join(tempDir, '_journal.json');
    await writeFile(journalPath, 'not valid json {{{');

    expect(readJournal(journalPath)).rejects.toThrow();
  });
});

describe('writeJournal', () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'vertz-journal-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('writes journal to file', async () => {
    const journalPath = join(tempDir, '_journal.json');
    const journal = addJournalEntry(createJournal(), {
      name: '0001_initial_schema.sql',
      description: 'Initial schema',
      createdAt: '2026-02-27T00:00:00.000Z',
      checksum: 'abc123',
    });

    await writeJournal(journalPath, journal);

    const content = await readJournal(journalPath);
    expect(content.version).toBe(1);
    expect(content.migrations).toHaveLength(1);
    expect(content.migrations[0]?.name).toBe('0001_initial_schema.sql');
  });

  it('creates parent directories', async () => {
    const journalPath = join(tempDir, 'nested', 'deep', '_journal.json');
    const journal = createJournal();

    await writeJournal(journalPath, journal);

    const content = await readJournal(journalPath);
    expect(content.version).toBe(1);
    expect(content.migrations).toEqual([]);
  });

  it('roundtrip: write then read returns same data', async () => {
    const journalPath = join(tempDir, '_journal.json');
    const entry: JournalEntry = {
      name: '0001_initial_schema.sql',
      description: 'Initial schema',
      createdAt: '2026-02-27T00:00:00.000Z',
      checksum: 'abc123',
    };
    const journal = addJournalEntry(createJournal(), entry);

    await writeJournal(journalPath, journal);
    const read = await readJournal(journalPath);

    expect(read).toEqual(journal);
  });
});

describe('detectCollisions', () => {
  it('returns empty array when there are no collisions', () => {
    const journal = addJournalEntry(createJournal(), {
      name: '0001_initial_schema.sql',
      description: 'Initial schema',
      createdAt: '2026-02-27T00:00:00.000Z',
      checksum: 'abc123',
    });

    const collisions = detectCollisions(journal, ['0002_add_users.sql']);

    expect(collisions).toEqual([]);
  });

  it('detects collision when two files share sequence number', () => {
    const journal = addJournalEntry(createJournal(), {
      name: '0001_initial_schema.sql',
      description: 'Initial schema',
      createdAt: '2026-02-27T00:00:00.000Z',
      checksum: 'abc123',
    });

    const collisions = detectCollisions(journal, ['0001_add_users.sql']);

    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.existingName).toBe('0001_initial_schema.sql');
    expect(collisions[0]?.conflictingName).toBe('0001_add_users.sql');
    expect(collisions[0]?.sequenceNumber).toBe(1);
    expect(collisions[0]?.suggestedName).toBe('0002_add_users.sql');
  });

  it('handles multiple collisions with incrementing suggestions', () => {
    let journal = createJournal();
    journal = addJournalEntry(journal, {
      name: '0001_initial_schema.sql',
      description: 'Initial schema',
      createdAt: '2026-02-27T00:00:00.000Z',
      checksum: 'abc123',
    });
    journal = addJournalEntry(journal, {
      name: '0002_add_users.sql',
      description: 'Add users',
      createdAt: '2026-02-27T01:00:00.000Z',
      checksum: 'def456',
    });

    const collisions = detectCollisions(journal, ['0001_add_posts.sql', '0002_add_comments.sql']);

    expect(collisions).toHaveLength(2);
    expect(collisions[0]?.conflictingName).toBe('0001_add_posts.sql');
    expect(collisions[0]?.suggestedName).toBe('0003_add_posts.sql');
    expect(collisions[1]?.conflictingName).toBe('0002_add_comments.sql');
    expect(collisions[1]?.suggestedName).toBe('0004_add_comments.sql');
  });
});
