export enum ErrorCode {
  InvalidType = 'invalid_type',
  TooSmall = 'too_small',
  TooBig = 'too_big',
  InvalidString = 'invalid_string',
  InvalidEnumValue = 'invalid_enum_value',
  InvalidLiteral = 'invalid_literal',
  InvalidUnion = 'invalid_union',
  InvalidDate = 'invalid_date',
  MissingProperty = 'missing_property',
  UnrecognizedKeys = 'unrecognized_keys',
  Custom = 'custom',
  InvalidIntersection = 'invalid_intersection',
  NotMultipleOf = 'not_multiple_of',
  NotFinite = 'not_finite',
}

export interface ValidationIssue {
  code: ErrorCode;
  message: string;
  path: (string | number)[];
  expected?: string;
  received?: string;
}

export class ParseError extends Error {
  public readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    const message = ParseError.formatMessage(issues);
    super(message);
    this.name = 'ParseError';
    this.issues = issues;
  }

  static formatMessage(issues: ValidationIssue[]): string {
    return issues
      .map((issue) => {
        const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : '';
        return `${issue.message}${path}`;
      })
      .join('; ');
  }
}
