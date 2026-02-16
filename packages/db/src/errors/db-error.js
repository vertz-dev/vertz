// ---------------------------------------------------------------------------
// DbError — abstract base class for all database errors
// ---------------------------------------------------------------------------
export class DbError extends Error {
  /** Raw PostgreSQL SQLSTATE code, if applicable. */
  pgCode;
  table;
  query;
  constructor(message) {
    super(message);
    this.name = new.target.name;
  }
  toJSON() {
    const json = {
      error: this.name,
      code: this.code,
      message: this.message,
    };
    if (this.table !== undefined) {
      json.table = this.table;
    }
    return json;
  }
}
export class UniqueConstraintError extends DbError {
  code = 'UNIQUE_VIOLATION';
  pgCode = '23505';
  table;
  query;
  column;
  value;
  constructor(options) {
    super(
      `Unique constraint violated on ${options.table}.${options.column}${options.value !== undefined ? ` (value: ${options.value})` : ''}`,
    );
    this.table = options.table;
    this.column = options.column;
    this.value = options.value;
    this.query = options.query;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      table: this.table,
      column: this.column,
    };
  }
}
export class ForeignKeyError extends DbError {
  code = 'FOREIGN_KEY_VIOLATION';
  pgCode = '23503';
  table;
  query;
  constraint;
  detail;
  constructor(options) {
    super(`Foreign key constraint "${options.constraint}" violated on table ${options.table}`);
    this.table = options.table;
    this.constraint = options.constraint;
    this.detail = options.detail;
    this.query = options.query;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      table: this.table,
    };
  }
}
export class NotNullError extends DbError {
  code = 'NOT_NULL_VIOLATION';
  pgCode = '23502';
  table;
  query;
  column;
  constructor(options) {
    super(`Not-null constraint violated on ${options.table}.${options.column}`);
    this.table = options.table;
    this.column = options.column;
    this.query = options.query;
  }
  toJSON() {
    return {
      ...super.toJSON(),
      table: this.table,
      column: this.column,
    };
  }
}
export class CheckConstraintError extends DbError {
  code = 'CHECK_VIOLATION';
  pgCode = '23514';
  table;
  query;
  constraint;
  constructor(options) {
    super(`Check constraint "${options.constraint}" violated on table ${options.table}`);
    this.table = options.table;
    this.constraint = options.constraint;
    this.query = options.query;
  }
  toJSON() {
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
  code = 'NOT_FOUND';
  table;
  query;
  constructor(table, query) {
    super(`Record not found in table ${table}`);
    this.table = table;
    this.query = query;
  }
  toJSON() {
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
  code = 'CONNECTION_ERROR';
  constructor(message) {
    super(`Database connection error: ${message}`);
  }
}
// ---------------------------------------------------------------------------
// ConnectionPoolExhaustedError
// ---------------------------------------------------------------------------
export class ConnectionPoolExhaustedError extends ConnectionError {
  code = 'POOL_EXHAUSTED';
  constructor(poolSize) {
    super(`Connection pool exhausted (max: ${poolSize})`);
    // Reset name since ConnectionError constructor sets it to ConnectionError
    this.name = 'ConnectionPoolExhaustedError';
  }
}
//# sourceMappingURL=db-error.js.map
