export declare class VertzException extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(message: string, statusCode?: number, code?: string, details?: unknown);
  toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=vertz-exception.d.ts.map
