export declare enum ErrorCode {
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
export declare class ParseError extends Error {
  readonly issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]);
  static formatMessage(issues: ValidationIssue[]): string;
}
//# sourceMappingURL=errors.d.ts.map
