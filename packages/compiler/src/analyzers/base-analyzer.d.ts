import type { Project } from 'ts-morph';
import type { ResolvedConfig } from '../config';
import type { Diagnostic } from '../errors';
export interface Analyzer<T> {
  analyze(): Promise<T>;
}
export declare abstract class BaseAnalyzer<T> implements Analyzer<T> {
  protected readonly project: Project;
  protected readonly config: ResolvedConfig;
  private readonly _diagnostics;
  constructor(project: Project, config: ResolvedConfig);
  abstract analyze(): Promise<T>;
  protected addDiagnostic(diagnostic: Diagnostic): void;
  getDiagnostics(): Diagnostic[];
}
//# sourceMappingURL=base-analyzer.d.ts.map
