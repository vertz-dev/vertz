import { DbError } from './db-error';
export interface PgErrorInput {
  readonly code: string;
  readonly message: string;
  readonly table?: string;
  readonly column?: string;
  readonly constraint?: string;
  readonly detail?: string;
}
/**
 * Maps a raw PostgreSQL error object to a typed DbError subclass.
 *
 * Extracts structured metadata (column, constraint, value) from the
 * PG error's `detail` and `message` fields.
 */
export declare function parsePgError(pgError: PgErrorInput, query?: string): DbError;
//# sourceMappingURL=pg-parser.d.ts.map
