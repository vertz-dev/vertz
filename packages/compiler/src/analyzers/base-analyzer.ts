import type { Project } from 'ts-morph';
import type { ResolvedConfig } from '../config';
import type { Diagnostic } from '../errors';

export interface Analyzer<T> {
  analyze(): Promise<T>;
}

export abstract class BaseAnalyzer<T> implements Analyzer<T> {
  protected readonly project: Project;
  protected readonly config: ResolvedConfig;
  private readonly _diagnostics: Diagnostic[] = [];

  constructor(project: Project, config: ResolvedConfig) {
    this.project = project;
    this.config = config;
  }

  abstract analyze(): Promise<T>;

  protected addDiagnostic(diagnostic: Diagnostic): void {
    this._diagnostics.push(diagnostic);
  }

  getDiagnostics(): Diagnostic[] {
    return [...this._diagnostics];
  }
}
