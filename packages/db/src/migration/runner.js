import { createHash } from 'node:crypto';

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
export function computeChecksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}
/**
 * Parse a migration filename to extract its timestamp number.
 * Expected format: NNNN_description.sql
 */
export function parseMigrationName(filename) {
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
export function createMigrationRunner() {
  return {
    async createHistoryTable(queryFn) {
      await queryFn(CREATE_HISTORY_SQL, []);
    },
    async apply(queryFn, sql, name, options) {
      const checksum = computeChecksum(sql);
      const recordSql = `INSERT INTO "${HISTORY_TABLE}" ("name", "checksum") VALUES ($1, $2)`;
      // Collect all statements that would be executed
      const statements = [sql, recordSql];
      if (options?.dryRun) {
        return {
          name,
          sql,
          checksum,
          dryRun: true,
          statements,
        };
      }
      // Execute the migration SQL
      await queryFn(sql, []);
      // Record in history
      await queryFn(recordSql, [name, checksum]);
      return {
        name,
        sql,
        checksum,
        dryRun: false,
        statements,
      };
    },
    async getApplied(queryFn) {
      const result = await queryFn(
        `SELECT "name", "checksum", "applied_at" FROM "${HISTORY_TABLE}" ORDER BY "id" ASC`,
        [],
      );
      return result.rows.map((row) => ({
        name: row.name,
        checksum: row.checksum,
        appliedAt: new Date(row.applied_at),
      }));
    },
    getPending(files, applied) {
      const appliedNames = new Set(applied.map((a) => a.name));
      return files
        .filter((f) => !appliedNames.has(f.name))
        .sort((a, b) => a.timestamp - b.timestamp);
    },
    detectDrift(files, applied) {
      const drifted = [];
      const appliedMap = new Map(applied.map((a) => [a.name, a.checksum]));
      for (const file of files) {
        const appliedChecksum = appliedMap.get(file.name);
        if (appliedChecksum && appliedChecksum !== computeChecksum(file.sql)) {
          drifted.push(file.name);
        }
      }
      return drifted;
    },
    detectOutOfOrder(files, applied) {
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
//# sourceMappingURL=runner.js.map
