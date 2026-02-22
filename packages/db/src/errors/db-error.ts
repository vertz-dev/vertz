// ---------------------------------------------------------------------------
// DbError — abstract base class for all database errors
// ---------------------------------------------------------------------------

export interface DbErrorJson {
  readonly error: string;
  readonly code: string;
  readonly message: string;
  readonly table?: string;
  readonly column?: string;
}

export abstract class DbError extends Error {
  abstract readonly code: string;
  /** Raw PostgreSQL SQLSTATE code, if applicable. */
  readonly pgCode?: string | undefined;
  readonly table?: string | undefined;
  readonly query?: string | undefined;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }

  toJSON(): DbErrorJson {
    const json: DbErrorJson = {
      error: this.name,
      code: this.code,
      message: this.message,
    };
    if (this.table !== undefined) {
      (json as { table: string }).table = this.table;
    }
    return json;
  }
}

// ---------------------------------------------------------------------------
// UniqueConstraintError — PG 23505
// ---------------------------------------------------------------------------

export interface UniqueConstraintErrorOptions {
  readonly table: string;
  readonly column: string;
  readonly value?: string;
  readonly query?: string;
}

export class UniqueConstraintError extends DbError {
  readonly code = 'UNIQUE_VIOLATION' as const;
  readonly pgCode = '23505' as const;
  override readonly table: string;
  override readonly query: string | undefined;
  readonly column: string;
  readonly value: string | undefined;

  constructor(options: UniqueConstraintErrorOptions) {
    super(
      `Unique constraint violated on ${options.table}.${options.column}${
        options.value !== undefined ? ` (value: ${options.value})` : ''
      }`,
    );
    this.table = options.table;
    this.column = options.column;
    this.value = options.value;
    this.query = options.query;
  }

  override toJSON(): DbErrorJson {
    return {
      ...super.toJSON(),
      table: this.table,
      column: this.column,
    };
  }
}

// ---------------------------------------------------------------------------
// ForeignKeyError — PG 23503
// ---------------------------------------------------------------------------

export interface ForeignKeyErrorOptions {
  readonly table: string;
  readonly constraint: string;
  readonly detail?: string;
  readonly query?: string;
}

export class ForeignKeyError extends DbError {
  readonly code = 'FOREIGN_KEY_VIOLATION' as const;
  readonly pgCode = '23503' as const;
  override readonly table: string;
  override readonly query: string | undefined;
  readonly constraint: string;
  readonly detail: string | undefined;

  constructor(options: ForeignKeyErrorOptions) {
    super(`Foreign key constraint "${options.constraint}" violated on table ${options.table}`);
    this.table = options.table;
    this.constraint = options.constraint;
    this.detail = options.detail;
    this.query = options.query;
  }

  override toJSON(): DbErrorJson {
    return {
      ...super.toJSON(),
      table: this.table,
    };
  }
}

// ---------------------------------------------------------------------------
// NotNullError — PG 23502
// ---------------------------------------------------------------------------

export interface NotNullErrorOptions {
  readonly table: string;
  readonly column: string;
  readonly query?: string;
}

export class NotNullError extends DbError {
  readonly code = 'NOT_NULL_VIOLATION' as const;
  readonly pgCode = '23502' as const;
  override readonly table: string;
  override readonly query: string | undefined;
  readonly column: string;

  constructor(options: NotNullErrorOptions) {
    super(`Not-null constraint violated on ${options.table}.${options.column}`);
    this.table = options.table;
    this.column = options.column;
    this.query = options.query;
  }

  override toJSON(): DbErrorJson {
    return {
      ...super.toJSON(),
      table: this.table,
      column: this.column,
    };
  }
}

// ---------------------------------------------------------------------------
// CheckConstraintError — PG 23514
// ---------------------------------------------------------------------------

export interface CheckConstraintErrorOptions {
  readonly table: string;
  readonly constraint: string;
  readonly query?: string;
}

export class CheckConstraintError extends DbError {
  readonly code = 'CHECK_VIOLATION' as const;
  readonly pgCode = '23514' as const;
  override readonly table: string;
  override readonly query: string | undefined;
  readonly constraint: string;

  constructor(options: CheckConstraintErrorOptions) {
    super(`Check constraint "${options.constraint}" violated on table ${options.table}`);
    this.table = options.table;
    this.constraint = options.constraint;
    this.query = options.query;
  }

  override toJSON(): DbErrorJson {
    return {
      ...super.toJSON(),
      table: this.table,
    };
  }
}

// ---------------------------------------------------------------------------
// NotFoundError
// ---------------------------------------------------------------------------

export class NotFoundError extends DbError {
  readonly code = 'NotFound' as const;
  override readonly table: string;
  override readonly query: string | undefined;

  constructor(table: string, query?: string) {
    super(`Record not found in table ${table}`);
    this.table = table;
    this.query = query;
  }

  override toJSON(): DbErrorJson {
    return {
      ...super.toJSON(),
      table: this.table,
    };
  }
}

// ---------------------------------------------------------------------------
// ConnectionError
// ---------------------------------------------------------------------------

export class ConnectionError extends DbError {
  readonly code: string = 'CONNECTION_ERROR';

  constructor(message: string) {
    super(`Database connection error: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// ConnectionPoolExhaustedError
// ---------------------------------------------------------------------------

export class ConnectionPoolExhaustedError extends ConnectionError {
  override readonly code = 'POOL_EXHAUSTED' as const;

  constructor(poolSize: number) {
    super(`Connection pool exhausted (max: ${poolSize})`);
    // Reset name since ConnectionError constructor sets it to ConnectionError
    this.name = 'ConnectionPoolExhaustedError';
  }
}
