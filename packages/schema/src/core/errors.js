export var ErrorCode;
((ErrorCode) => {
  ErrorCode.InvalidType = 'invalid_type';
  ErrorCode.TooSmall = 'too_small';
  ErrorCode.TooBig = 'too_big';
  ErrorCode.InvalidString = 'invalid_string';
  ErrorCode.InvalidEnumValue = 'invalid_enum_value';
  ErrorCode.InvalidLiteral = 'invalid_literal';
  ErrorCode.InvalidUnion = 'invalid_union';
  ErrorCode.InvalidDate = 'invalid_date';
  ErrorCode.MissingProperty = 'missing_property';
  ErrorCode.UnrecognizedKeys = 'unrecognized_keys';
  ErrorCode.Custom = 'custom';
  ErrorCode.InvalidIntersection = 'invalid_intersection';
  ErrorCode.NotMultipleOf = 'not_multiple_of';
  ErrorCode.NotFinite = 'not_finite';
})(ErrorCode || (ErrorCode = {}));
export class ParseError extends Error {
  issues;
  constructor(issues) {
    const message = ParseError.formatMessage(issues);
    super(message);
    this.name = 'ParseError';
    this.issues = issues;
  }
  static formatMessage(issues) {
    return issues
      .map((issue) => {
        const path = issue.path.length > 0 ? ` at "${issue.path.join('.')}"` : '';
        return `${issue.message}${path}`;
      })
      .join('; ');
  }
}
//# sourceMappingURL=errors.js.map
