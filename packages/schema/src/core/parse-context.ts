import type { ValidationIssue } from './errors';

export class ParseContext {
  readonly issues: ValidationIssue[] = [];
  private _path: (string | number)[] = [];

  addIssue(issue: Omit<ValidationIssue, 'path'> & { path?: (string | number)[] }): void {
    this.issues.push({
      ...issue,
      path: issue.path ?? [...this._path],
    });
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  pushPath(segment: string | number): void {
    this._path.push(segment);
  }

  popPath(): void {
    this._path.pop();
  }

  get path(): (string | number)[] {
    return [...this._path];
  }
}

/** Public-facing refinement context — subset of ParseContext exposed to .refine()/.superRefine()/.check() */
export interface RefinementContext {
  addIssue(issue: Omit<ValidationIssue, 'path'> & { path?: (string | number)[] }): void;
  readonly path: (string | number)[];
}
