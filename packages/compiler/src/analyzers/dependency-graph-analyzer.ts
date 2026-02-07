import { createDiagnostic } from '../errors';
import type {
  DependencyEdge,
  DependencyGraphIR,
  DependencyNode,
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
    const resolvedInput = input ?? this.input;
    const nodes: DependencyNode[] = [];

    for (const mod of resolvedInput.modules) {
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

    for (const mw of resolvedInput.middleware) {
      nodes.push({ id: `middleware:${mw.name}`, kind: 'middleware', name: mw.name });
    }

    const edges: DependencyEdge[] = [];

    // Build service lookup: resolvedToken -> node ID
    const serviceTokenMap = new Map<string, string>();
    for (const mod of resolvedInput.modules) {
      for (const svc of mod.services) {
        serviceTokenMap.set(svc.name, `service:${mod.name}.${svc.name}`);
      }
    }

    // Module import edges
    for (const mod of resolvedInput.modules) {
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

    // Inject edges for services
    for (const mod of resolvedInput.modules) {
      for (const svc of mod.services) {
        for (const inj of svc.inject) {
          const targetId = serviceTokenMap.get(inj.resolvedToken);
          if (targetId) {
            edges.push({
              from: `service:${mod.name}.${svc.name}`,
              to: targetId,
              kind: 'inject',
            });
          }
        }
      }
    }

    // Inject edges for routers
    for (const mod of resolvedInput.modules) {
      for (const router of mod.routers) {
        for (const inj of router.inject) {
          const targetId = serviceTokenMap.get(inj.resolvedToken);
          if (targetId) {
            edges.push({
              from: `router:${mod.name}.${router.name}`,
              to: targetId,
              kind: 'inject',
            });
          }
        }
      }
    }

    // Inject edges for middleware
    for (const mw of resolvedInput.middleware) {
      for (const inj of mw.inject) {
        const targetId = serviceTokenMap.get(inj.resolvedToken);
        if (targetId) {
          edges.push({
            from: `middleware:${mw.name}`,
            to: targetId,
            kind: 'inject',
          });
        }
      }
    }

    // Uses-middleware edges for routes
    for (const mod of resolvedInput.modules) {
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
    for (const mod of resolvedInput.modules) {
      for (const exportName of mod.exports) {
        const targetId = serviceTokenMap.get(exportName);
        if (targetId) {
          edges.push({
            from: `module:${mod.name}`,
            to: targetId,
            kind: 'exports',
          });
        }
      }
    }

    // Topological sort (Kahn's algorithm) on module import edges
    const moduleNames = resolvedInput.modules.map((m) => m.name);
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

    // Detect cycles: modules not in topo order are in cycles
    const circularDependencies: string[][] = [];
    const sorted = new Set(initializationOrder);
    const unsorted = moduleNames.filter((n) => !sorted.has(n));

    if (unsorted.length > 0) {
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
        if (component.length > 1) {
          circularDependencies.push(component);
        }
      }

      // Emit diagnostic for each cycle
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

      // Add unsorted modules to initialization order (best-effort)
      for (const name of unsorted) {
        initializationOrder.push(name);
      }
    }

    // Emit warning for unresolved inject references
    for (const mod of resolvedInput.modules) {
      for (const svc of mod.services) {
        for (const inj of svc.inject) {
          if (!serviceTokenMap.has(inj.resolvedToken)) {
            this.addDiagnostic(
              createDiagnostic({
                severity: 'warning',
                code: 'VERTZ_DEP_UNRESOLVED_INJECT',
                message: `Unresolved inject "${inj.resolvedToken}" in service "${svc.name}" of module "${mod.name}".`,
              }),
            );
          }
        }
      }
      for (const router of mod.routers) {
        for (const inj of router.inject) {
          if (!serviceTokenMap.has(inj.resolvedToken)) {
            this.addDiagnostic(
              createDiagnostic({
                severity: 'warning',
                code: 'VERTZ_DEP_UNRESOLVED_INJECT',
                message: `Unresolved inject "${inj.resolvedToken}" in router "${router.name}" of module "${mod.name}".`,
              }),
            );
          }
        }
      }
    }
    for (const mw of resolvedInput.middleware) {
      for (const inj of mw.inject) {
        if (!serviceTokenMap.has(inj.resolvedToken)) {
          this.addDiagnostic(
            createDiagnostic({
              severity: 'warning',
              code: 'VERTZ_DEP_UNRESOLVED_INJECT',
              message: `Unresolved inject "${inj.resolvedToken}" in middleware "${mw.name}".`,
            }),
          );
        }
      }
    }

    // Emit info diagnostic for initialization order
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
      graph: {
        nodes,
        edges,
        initializationOrder,
        circularDependencies,
      },
    };
  }
}
