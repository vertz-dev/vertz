export class VertzException extends Error {
  statusCode;
  code;
  details;
  constructor(message, statusCode = 500, code, details) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code ?? this.name;
    this.details = details;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  toJSON() {
    return {
      error: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      ...(this.details !== undefined && { details: this.details }),
    };
  }
}
//# sourceMappingURL=vertz-exception.js.map
