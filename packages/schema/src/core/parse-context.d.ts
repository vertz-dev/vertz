import type { ValidationIssue } from './errors';
export declare class ParseContext {
  readonly issues: ValidationIssue[];
  private _path;
  addIssue(
    issue: Omit<ValidationIssue, 'path'> & {
      path?: (string | number)[];
    },
  ): void;
  hasIssues(): boolean;
  pushPath(segment: string | number): void;
  popPath(): void;
  get path(): (string | number)[];
}
/** Public-facing refinement context — subset of ParseContext exposed to .refine()/.superRefine()/.check() */
export interface RefinementContext {
  addIssue(
    issue: Omit<ValidationIssue, 'path'> & {
      path?: (string | number)[];
    },
  ): void;
  readonly path: (string | number)[];
}
//# sourceMappingURL=parse-context.d.ts.map
