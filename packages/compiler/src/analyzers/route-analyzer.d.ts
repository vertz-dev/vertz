import type { ModuleDefContext, RouterIR } from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';
export interface RouteAnalyzerResult {
  routers: RouterIR[];
}
export declare class RouteAnalyzer extends BaseAnalyzer<RouteAnalyzerResult> {
  analyze(): Promise<RouteAnalyzerResult>;
  analyzeForModules(context: ModuleDefContext): Promise<RouteAnalyzerResult>;
  private detectUnknownRouterCalls;
  private extractRoutes;
  private findChainedHttpCalls;
  private chainResolvesToVariable;
  private extractRoute;
  private resolveSchemaRef;
  private extractMiddlewareRefs;
  private generateOperationId;
}
//# sourceMappingURL=route-analyzer.d.ts.map
