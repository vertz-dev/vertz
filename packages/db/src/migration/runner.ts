import {
  createMigrationQueryError,
  err,
  type MigrationError,
  ok,
  type Result,
} from '@vertz/errors';
import { sha256Hex } from '../util/hash';

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
 * Options for the apply method.
 */
export interface ApplyOptions {
  /** When true, return the SQL statements without executing them. */
  dryRun?: boolean;
}

/**
 * Result of applying (or dry-running) a migration.
 */
export interface ApplyResult {
  /** The migration name. */
  name: string;
  /** The SQL that was (or would be) executed. */
  sql: string;
  /** The computed checksum of the migration SQL. */
  checksum: string;
  /** Whether this was a dry run. */
  dryRun: boolean;
  /** The statements that were (or would be) executed, in order. */
  statements: string[];
}

/**
 * The migration runner interface.
 */
export interface MigrationRunner {
  createHistoryTable(queryFn: MigrationQueryFn): Promise<Result<void, MigrationError>>;
  apply(
    queryFn: MigrationQueryFn,
    sql: string,
    name: string,
    options?: ApplyOptions,
  ): Promise<Result<ApplyResult, MigrationError>>;
  getApplied(queryFn: MigrationQueryFn): Promise<Result<AppliedMigration[], MigrationError>>;
  getPending(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[];
  detectDrift(files: MigrationFile[], applied: AppliedMigration[]): Promise<string[]>;
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
export async function computeChecksum(sql: string): Promise<string> {
  return sha256Hex(sql);
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
    async createHistoryTable(queryFn: MigrationQueryFn): Promise<Result<void, MigrationError>> {
      try {
        await queryFn(CREATE_HISTORY_SQL, []);
        return ok(undefined);
      } catch (cause) {
        return err(
          createMigrationQueryError('Failed to create migration history table', {
            sql: CREATE_HISTORY_SQL,
            cause,
          }),
        );
      }
    },

    async apply(
      queryFn: MigrationQueryFn,
      sql: string,
      name: string,
      options?: ApplyOptions,
    ): Promise<Result<ApplyResult, MigrationError>> {
      const checksum = await computeChecksum(sql);
      const recordSql = `INSERT INTO "${HISTORY_TABLE}" ("name", "checksum") VALUES ($1, $2)`;

      // Collect all statements that would be executed
      const statements = [sql, recordSql];

      if (options?.dryRun) {
        return ok({
          name,
          sql,
          checksum,
          dryRun: true,
          statements,
        });
      }

      try {
        // Execute the migration SQL
        await queryFn(sql, []);

        // Record in history
        await queryFn(recordSql, [name, checksum]);

        return ok({
          name,
          sql,
          checksum,
          dryRun: false,
          statements,
        });
      } catch (cause) {
        return err(
          createMigrationQueryError(`Failed to apply migration: ${name}`, {
            sql,
            cause,
          }),
        );
      }
    },

    async getApplied(
      queryFn: MigrationQueryFn,
    ): Promise<Result<AppliedMigration[], MigrationError>> {
      try {
        const result = await queryFn(
          `SELECT "name", "checksum", "applied_at" FROM "${HISTORY_TABLE}" ORDER BY "id" ASC`,
          [],
        );

        return ok(
          result.rows.map((row) => ({
            name: row.name as string,
            checksum: row.checksum as string,
            appliedAt: new Date(row.applied_at as string),
          })),
        );
      } catch (cause) {
        return err(
          createMigrationQueryError('Failed to retrieve applied migrations', {
            cause,
          }),
        );
      }
    },

    getPending(files: MigrationFile[], applied: AppliedMigration[]): MigrationFile[] {
      const appliedNames = new Set(applied.map((a) => a.name));
      return files
        .filter((f) => !appliedNames.has(f.name))
        .sort((a, b) => a.timestamp - b.timestamp);
    },

    async detectDrift(files: MigrationFile[], applied: AppliedMigration[]): Promise<string[]> {
      const drifted: string[] = [];
      const appliedMap = new Map(applied.map((a) => [a.name, a.checksum]));

      for (const file of files) {
        const appliedChecksum = appliedMap.get(file.name);
        if (appliedChecksum && appliedChecksum !== (await computeChecksum(file.sql))) {
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
