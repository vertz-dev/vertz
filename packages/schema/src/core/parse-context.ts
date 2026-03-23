import type { ValidationIssue } from './errors';

export class ParseContext {
  private _issues: ValidationIssue[] | null = null;
  private _path: (string | number)[] = [];

  get issues(): ValidationIssue[] {
    return this._issues ?? [];
  }

  addIssue(issue: Omit<ValidationIssue, 'path'> & { path?: (string | number)[] }): void {
    if (this._issues === null) this._issues = [];
    this._issues.push({
      ...issue,
      path: issue.path ?? [...this._path],
    });
  }

  hasIssues(): boolean {
    return this._issues !== null && this._issues.length > 0;
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
