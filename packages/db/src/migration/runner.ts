import { createHash } from 'node:crypto';

/**
 * The query function type expected by the migration runner.
 */
export type MigrationQueryFn = (
  sql: string,
  params: readonly unknown[],
) => Promise<{ rows: readonly Record<string, unknown>[]; rowCount: number }>;

/**
 * Represents a migration that has been applied to the database.
 */
export interface AppliedMigration {
  name: string;
  appliedAt: Date;
  checksum: string;
}

/**
 * Represents a migration file on disk.
 */
export interface MigrationFile {
  name: string;
  sql: string;
  timestamp: number;
}

/**
 * The migration runner interface.
 */
export interface MigrationRunner {
  createHistoryTable(queryFn: MigrationQueryFn): Promise<void>;
  apply(queryFn: MigrationQueryFn, sql: string, name: string): Promise<void>;
  getApplied(queryFn: MigrationQueryFn): Promise<AppliedMigration[]>;
  getPending(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[];
  detectDrift(files: MigrationFile[], applied: AppliedMigration[]): string[];
  detectOutOfOrder(files: MigrationFile[], applied: AppliedMigration[]): string[];
}

const HISTORY_TABLE = '_vertz_migrations';

const CREATE_HISTORY_SQL = `
CREATE TABLE IF NOT EXISTS "${HISTORY_TABLE}" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL UNIQUE,
  "checksum" text NOT NULL,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now()
);
`;

/**
 * Compute a SHA-256 checksum for migration SQL content.
 */
export function computeChecksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Parse a migration filename to extract its timestamp number.
 * Expected format: NNNN_description.sql
 */
export function parseMigrationName(filename: string): { timestamp: number; name: string } | null {
  const match = filename.match(/^(\d+)_(.+)\.sql$/);
  if (!match?.[1] || !match[2]) return null;
  return {
    timestamp: Number.parseInt(match[1], 10),
    name: filename,
  };
}

/**
 * Create a migration runner instance.
 */
export function createMigrationRunner(): MigrationRunner {
  return {
    async createHistoryTable(queryFn: MigrationQueryFn): Promise<void> {
      await queryFn(CREATE_HISTORY_SQL, []);
    },

    async apply(queryFn: MigrationQueryFn, sql: string, name: string): Promise<void> {
      const checksum = computeChecksum(sql);

      // Execute the migration SQL
      await queryFn(sql, []);

      // Record in history
      await queryFn(`INSERT INTO "${HISTORY_TABLE}" ("name", "checksum") VALUES ($1, $2)`, [
        name,
        checksum,
      ]);
    },

    async getApplied(queryFn: MigrationQueryFn): Promise<AppliedMigration[]> {
      const result = await queryFn(
        `SELECT "name", "checksum", "applied_at" FROM "${HISTORY_TABLE}" ORDER BY "id" ASC`,
        [],
      );

      return result.rows.map((row) => ({
        name: row.name as string,
        checksum: row.checksum as string,
        appliedAt: new Date(row.applied_at as string),
      }));
    },

    getPending(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[] {
      const appliedNames = new Set(applied.map((a) => a.name));
      return files
        .filter((f) => !appliedNames.has(f.name))
        .sort((a, b) => a.timestamp - b.timestamp);
    },

    detectDrift(files: MigrationFile[], applied: AppliedMigration[]): string[] {
      const drifted: string[] = [];
      const appliedMap = new Map(applied.map((a) => [a.name, a.checksum]));

      for (const file of files) {
        const appliedChecksum = appliedMap.get(file.name);
        if (appliedChecksum && appliedChecksum !== computeChecksum(file.sql)) {
          drifted.push(file.name);
        }
      }

      return drifted;
    },

    detectOutOfOrder(files: MigrationFile[], applied: AppliedMigration[]): string[] {
      if (applied.length === 0) return [];

      const appliedNames = new Set(applied.map((a) => a.name));
      const lastApplied = applied[applied.length - 1];
      if (!lastApplied) return [];

      // Find the timestamp of the last applied migration
      const lastAppliedFile = files.find((f) => f.name === lastApplied.name);
      if (!lastAppliedFile) return [];

      // Any pending migration with a timestamp less than the last applied is out-of-order
      return files
        .filter((f) => !appliedNames.has(f.name) && f.timestamp < lastAppliedFile.timestamp)
        .map((f) => f.name);
    },
  };
}
