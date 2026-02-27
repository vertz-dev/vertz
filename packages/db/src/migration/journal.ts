import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { formatMigrationFilename } from './files';
import { parseMigrationName } from './runner';

export interface JournalEntry {
  name: string;
  description: string;
  createdAt: string;
  checksum: string;
}

export interface Journal {
  version: 1;
  migrations: JournalEntry[];
}

/**
 * Create an empty journal.
 */
export function createJournal(): Journal {
  return {
    version: 1,
    migrations: [],
  };
}

/**
 * Add an entry to a journal. Returns a new journal (immutable).
 */
export function addJournalEntry(journal: Journal, entry: JournalEntry): Journal {
  return {
    ...journal,
    migrations: [...journal.migrations, entry],
  };
}

/**
 * Read a journal from the filesystem. Returns empty journal if file doesn't exist.
 */
export async function readJournal(journalPath: string): Promise<Journal> {
  try {
    const content = await readFile(journalPath, 'utf-8');
    return JSON.parse(content) as Journal;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createJournal();
    }
    throw error;
  }
}

/**
 * Write a journal to the filesystem. Creates parent directories if needed.
 */
export async function writeJournal(journalPath: string, journal: Journal): Promise<void> {
  await mkdir(dirname(journalPath), { recursive: true });
  await writeFile(journalPath, JSON.stringify(journal, null, 2));
}

export interface CollisionInfo {
  existingName: string;
  conflictingName: string;
  sequenceNumber: number;
  suggestedName: string;
}

/**
 * Detect sequence number collisions between journal entries and existing files.
 * Returns info about which files collide so they can be renumbered.
 */
export function detectCollisions(journal: Journal, existingFiles: string[]): CollisionInfo[] {
  const journalSeqNumbers = new Map<number, string>();
  for (const entry of journal.migrations) {
    const parsed = parseMigrationName(entry.name);
    if (parsed) {
      journalSeqNumbers.set(parsed.timestamp, entry.name);
    }
  }

  // Collect all used sequence numbers (journal + existing files)
  const allUsedSeqNumbers = new Set(journalSeqNumbers.keys());
  for (const file of existingFiles) {
    const parsed = parseMigrationName(file);
    if (parsed) {
      allUsedSeqNumbers.add(parsed.timestamp);
    }
  }

  const collisions: CollisionInfo[] = [];

  for (const file of existingFiles) {
    const parsed = parseMigrationName(file);
    if (!parsed) continue;

    const journalEntry = journalSeqNumbers.get(parsed.timestamp);
    if (journalEntry && journalEntry !== file) {
      // Find the next available sequence number
      let nextSeq = Math.max(...allUsedSeqNumbers) + 1;
      // Also account for previously suggested numbers
      for (const c of collisions) {
        const suggestedParsed = parseMigrationName(c.suggestedName);
        if (suggestedParsed && suggestedParsed.timestamp >= nextSeq) {
          nextSeq = suggestedParsed.timestamp + 1;
        }
      }

      const description = file.replace(/^\d+_/, '').replace(/\.sql$/, '');

      collisions.push({
        existingName: journalEntry,
        conflictingName: file,
        sequenceNumber: parsed.timestamp,
        suggestedName: formatMigrationFilename(nextSeq, description),
      });
    }
  }

  return collisions;
}
