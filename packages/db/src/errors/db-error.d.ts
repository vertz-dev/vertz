export interface DbErrorJson {
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly table?: string;
  readonly column?: string;
}
export declare abstract class DbError extends Error {
  abstract readonly code: string;
  /** Raw PostgreSQL SQLSTATE code, if applicable. */
  readonly pgCode?: string | undefined;
  readonly table?: string | undefined;
  readonly query?: string | undefined;
  constructor(message: string);
  toJSON(): DbErrorJson;
}
export interface UniqueConstraintErrorOptions {
  readonly table: string;
  readonly column: string;
  readonly value?: string;
  readonly query?: string;
}
export declare class UniqueConstraintError extends DbError {
  readonly code: 'UNIQUE_VIOLATION';
  readonly pgCode: '23505';
  readonly table: string;
  readonly query: string | undefined;
  readonly column: string;
  readonly value: string | undefined;
  constructor(options: UniqueConstraintErrorOptions);
  toJSON(): DbErrorJson;
}
export interface ForeignKeyErrorOptions {
  readonly table: string;
  readonly constraint: string;
  readonly detail?: string;
  readonly query?: string;
}
export declare class ForeignKeyError extends DbError {
  readonly code: 'FOREIGN_KEY_VIOLATION';
  readonly pgCode: '23503';
  readonly table: string;
  readonly query: string | undefined;
  readonly constraint: string;
  readonly detail: string | undefined;
  constructor(options: ForeignKeyErrorOptions);
  toJSON(): DbErrorJson;
}
export interface NotNullErrorOptions {
  readonly table: string;
  readonly column: string;
  readonly query?: string;
}
export declare class NotNullError extends DbError {
  readonly code: 'NOT_NULL_VIOLATION';
  readonly pgCode: '23502';
  readonly table: string;
  readonly query: string | undefined;
  readonly column: string;
  constructor(options: NotNullErrorOptions);
  toJSON(): DbErrorJson;
}
export interface CheckConstraintErrorOptions {
  readonly table: string;
  readonly constraint: string;
  readonly query?: string;
}
export declare class CheckConstraintError extends DbError {
  readonly code: 'CHECK_VIOLATION';
  readonly pgCode: '23514';
  readonly table: string;
  readonly query: string | undefined;
  readonly constraint: string;
  constructor(options: CheckConstraintErrorOptions);
  toJSON(): DbErrorJson;
}
export declare class NotFoundError extends DbError {
  readonly code: 'NOT_FOUND';
  readonly table: string;
  readonly query: string | undefined;
  constructor(table: string, query?: string);
  toJSON(): DbErrorJson;
}
export declare class ConnectionError extends DbError {
  readonly code: string;
  constructor(message: string);
}
export declare class ConnectionPoolExhaustedError extends ConnectionError {
  readonly code: 'POOL_EXHAUSTED';
  constructor(poolSize: number);
}
//# sourceMappingURL=db-error.d.ts.map
