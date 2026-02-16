import type { DependencyGraphIR, MiddlewareIR, ModuleIR } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface DependencyGraphInput {
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
}
export interface DependencyGraphResult {
  graph: DependencyGraphIR;
}
export declare class DependencyGraphAnalyzer extends BaseAnalyzer<DependencyGraphResult> {
  private input;
  setInput(input: DependencyGraphInput): void;
  analyze(input?: DependencyGraphInput): Promise<DependencyGraphResult>;
  private buildNodes;
  private buildServiceTokenMap;
  private buildEdges;
  private addInjectEdges;
  private computeModuleOrder;
  private detectCycles;
  private emitCycleDiagnostics;
  private emitUnresolvedInjectDiagnostics;
  private warnUnresolvedInjects;
}
//# sourceMappingURL=dependency-graph-analyzer.d.ts.map
