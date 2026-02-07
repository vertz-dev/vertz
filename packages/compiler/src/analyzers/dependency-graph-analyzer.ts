import { createDiagnostic } from '../errors';
import type {
  DependencyEdge,
  DependencyGraphIR,
  DependencyNode,
  InjectRef,
  MiddlewareIR,
  ModuleIR,
} from '../ir/types';
import { BaseAnalyzer } from './base-analyzer';

export interface DependencyGraphInput {
  modules: ModuleIR[];
  middleware: MiddlewareIR[];
}

export interface DependencyGraphResult {
  graph: DependencyGraphIR;
}

export class DependencyGraphAnalyzer extends BaseAnalyzer<DependencyGraphResult> {
  private input: DependencyGraphInput = { modules: [], middleware: [] };

  setInput(input: DependencyGraphInput): void {
    this.input = input;
  }

  async analyze(input?: DependencyGraphInput): Promise<DependencyGraphResult> {
    const { modules, middleware } = input ?? this.input;

    const nodes = this.buildNodes(modules, middleware);
    const serviceTokenMap = this.buildServiceTokenMap(modules);
    const edges = this.buildEdges(modules, middleware, serviceTokenMap);

    const moduleNames = modules.map((m) => m.name);
    const { initializationOrder, circularDependencies } = this.computeModuleOrder(
      moduleNames,
      edges,
    );

    this.emitCycleDiagnostics(circularDependencies);
    this.emitUnresolvedInjectDiagnostics(modules, middleware, serviceTokenMap);

    if (initializationOrder.length > 0) {
      this.addDiagnostic(
        createDiagnostic({
          severity: 'info',
          code: 'VERTZ_DEP_INIT_ORDER',
          message: `Module initialization order: ${initializationOrder.join(', ')}`,
        }),
      );
    }

    return {
      graph: { nodes, edges, initializationOrder, circularDependencies },
    };
  }

  private buildNodes(modules: ModuleIR[], middleware: MiddlewareIR[]): DependencyNode[] {
    const nodes: DependencyNode[] = [];

    for (const mod of modules) {
      nodes.push({ id: `module:${mod.name}`, kind: 'module', name: mod.name });
      for (const svc of mod.services) {
        nodes.push({
          id: `service:${mod.name}.${svc.name}`,
          kind: 'service',
          name: svc.name,
          moduleName: mod.name,
        });
      }
      for (const router of mod.routers) {
        nodes.push({
          id: `router:${mod.name}.${router.name}`,
          kind: 'router',
          name: router.name,
          moduleName: mod.name,
        });
      }
    }

    for (const mw of middleware) {
      nodes.push({ id: `middleware:${mw.name}`, kind: 'middleware', name: mw.name });
    }

    return nodes;
  }

  private buildServiceTokenMap(modules: ModuleIR[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const mod of modules) {
      for (const svc of mod.services) {
        map.set(svc.name, `service:${mod.name}.${svc.name}`);
      }
    }
    return map;
  }

  private buildEdges(
    modules: ModuleIR[],
    middleware: MiddlewareIR[],
    serviceTokenMap: Map<string, string>,
  ): DependencyEdge[] {
    const edges: DependencyEdge[] = [];

    // Module import edges
    for (const mod of modules) {
      const seen = new Set<string>();
      for (const imp of mod.imports) {
        if (imp.isEnvImport || !imp.sourceModule) continue;
        if (seen.has(imp.sourceModule)) continue;
        seen.add(imp.sourceModule);
        edges.push({
          from: `module:${mod.name}`,
          to: `module:${imp.sourceModule}`,
          kind: 'imports',
        });
      }
    }

    // Inject edges for services and routers
    for (const mod of modules) {
      for (const svc of mod.services) {
        this.addInjectEdges(edges, `service:${mod.name}.${svc.name}`, svc.inject, serviceTokenMap);
      }
      for (const router of mod.routers) {
        this.addInjectEdges(
          edges,
          `router:${mod.name}.${router.name}`,
          router.inject,
          serviceTokenMap,
        );
      }
    }

    // Inject edges for middleware
    for (const mw of middleware) {
      this.addInjectEdges(edges, `middleware:${mw.name}`, mw.inject, serviceTokenMap);
    }

    // Uses-middleware edges for routes
    for (const mod of modules) {
      for (const router of mod.routers) {
        for (const route of router.routes) {
          for (const mwRef of route.middleware) {
            edges.push({
              from: `router:${mod.name}.${router.name}`,
              to: `middleware:${mwRef.name}`,
              kind: 'uses-middleware',
            });
          }
        }
      }
    }

    // Export edges
    for (const mod of modules) {
      for (const exportName of mod.exports) {
        const targetId = serviceTokenMap.get(exportName);
        if (targetId) {
          edges.push({ from: `module:${mod.name}`, to: targetId, kind: 'exports' });
        }
      }
    }

    return edges;
  }

  private addInjectEdges(
    edges: DependencyEdge[],
    fromId: string,
    injectRefs: InjectRef[],
    serviceTokenMap: Map<string, string>,
  ): void {
    for (const inj of injectRefs) {
      const targetId = serviceTokenMap.get(inj.resolvedToken);
      if (targetId) {
        edges.push({ from: fromId, to: targetId, kind: 'inject' });
      }
    }
  }

  // Topological sort (Kahn's algorithm) with cycle detection
  private computeModuleOrder(
    moduleNames: string[],
    edges: DependencyEdge[],
  ): { initializationOrder: string[]; circularDependencies: string[][] } {
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    for (const name of moduleNames) {
      inDegree.set(name, 0);
      adjacency.set(name, []);
    }
    for (const edge of edges) {
      if (edge.kind !== 'imports') continue;
      const fromMod = edge.from.replace('module:', '');
      const toMod = edge.to.replace('module:', '');
      adjacency.get(toMod)?.push(fromMod);
      inDegree.set(fromMod, (inDegree.get(fromMod) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const name of moduleNames) {
      if (inDegree.get(name) === 0) {
        queue.push(name);
      }
    }

    const initializationOrder: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      initializationOrder.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    const circularDependencies = this.detectCycles(moduleNames, initializationOrder, edges);

    // Add unsorted modules to initialization order (best-effort)
    const sorted = new Set(initializationOrder);
    for (const name of moduleNames) {
      if (!sorted.has(name)) {
        initializationOrder.push(name);
      }
    }

    return { initializationOrder, circularDependencies };
  }

  private detectCycles(
    moduleNames: string[],
    sortedNames: string[],
    edges: DependencyEdge[],
  ): string[][] {
    const sorted = new Set(sortedNames);
    const unsorted = moduleNames.filter((n) => !sorted.has(n));
    if (unsorted.length === 0) return [];

    // Build adjacency for cycle detection (module -> modules it depends on)
    const depAdj = new Map<string, string[]>();
    for (const name of unsorted) {
      depAdj.set(name, []);
    }
    for (const edge of edges) {
      if (edge.kind !== 'imports') continue;
      const fromMod = edge.from.replace('module:', '');
      const toMod = edge.to.replace('module:', '');
      if (depAdj.has(fromMod) && depAdj.has(toMod)) {
        depAdj.get(fromMod)?.push(toMod);
      }
    }

    // Find connected components among unsorted nodes using DFS
    const cycles: string[][] = [];
    const visited = new Set<string>();
    for (const start of unsorted) {
      if (visited.has(start)) continue;
      const component: string[] = [];
      const stack = [start];
      while (stack.length > 0) {
        const node = stack.pop();
        if (!node) break;
        if (visited.has(node)) continue;
        visited.add(node);
        component.push(node);
        for (const dep of depAdj.get(node) ?? []) {
          if (!visited.has(dep)) stack.push(dep);
        }
        // Also check reverse edges
        for (const [other, deps] of depAdj) {
          if (deps.includes(node) && !visited.has(other)) {
            stack.push(other);
          }
        }
      }
      if (component.length >= 1) {
        cycles.push(component);
      }
    }

    return cycles;
  }

  private emitCycleDiagnostics(circularDependencies: string[][]): void {
    for (const cycle of circularDependencies) {
      const path = [...cycle, cycle.at(0)].join(' -> ');
      this.addDiagnostic(
        createDiagnostic({
          severity: 'error',
          code: 'VERTZ_DEP_CIRCULAR',
          message: `Circular dependency detected: ${path}`,
        }),
      );
    }
  }

  private emitUnresolvedInjectDiagnostics(
    modules: ModuleIR[],
    middleware: MiddlewareIR[],
    serviceTokenMap: Map<string, string>,
  ): void {
    for (const mod of modules) {
      for (const svc of mod.services) {
        this.warnUnresolvedInjects(
          svc.inject,
          serviceTokenMap,
          `service "${svc.name}" of module "${mod.name}"`,
        );
      }
      for (const router of mod.routers) {
        this.warnUnresolvedInjects(
          router.inject,
          serviceTokenMap,
          `router "${router.name}" of module "${mod.name}"`,
        );
      }
    }
    for (const mw of middleware) {
      this.warnUnresolvedInjects(mw.inject, serviceTokenMap, `middleware "${mw.name}"`);
    }
  }

  private warnUnresolvedInjects(
    injectRefs: InjectRef[],
    serviceTokenMap: Map<string, string>,
    context: string,
  ): void {
    for (const inj of injectRefs) {
      if (!serviceTokenMap.has(inj.resolvedToken)) {
        this.addDiagnostic(
          createDiagnostic({
            severity: 'warning',
            code: 'VERTZ_DEP_UNRESOLVED_INJECT',
            message: `Unresolved inject "${inj.resolvedToken}" in ${context}.`,
          }),
        );
      }
    }
  }
}
