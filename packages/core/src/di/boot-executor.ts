import type {
  BootSequence,
  ServiceBootInstruction,
} from '../types/boot-sequence';
import { makeImmutable } from '../immutability';

interface ServiceInstance {
  id: string;
  instance: unknown;
  onDestroy?: () => Promise<void> | void;
}

export class BootExecutor {
  private instances = new Map<string, ServiceInstance>();
  private shutdownOrder: string[] = [];

  async execute(sequence: BootSequence): Promise<Map<string, unknown>> {
    for (const instruction of sequence.instructions) {
      if (instruction.type === 'service') {
        await this.executeService(instruction);
      }
    }
    this.shutdownOrder = sequence.shutdownOrder;
    return this.getServiceMap();
  }

  async shutdown(): Promise<void> {
    for (const id of this.shutdownOrder) {
      const svc = this.instances.get(id);
      if (svc?.onDestroy) await svc.onDestroy();
    }
    this.instances.clear();
  }

  private async executeService(instr: ServiceBootInstruction): Promise<void> {
    const deps = makeImmutable(this.resolveDeps(instr.deps), 'deps');
    const state = instr.factory.onInit ? await instr.factory.onInit(deps) : undefined;
    const methods = instr.factory.methods(deps, state);

    this.instances.set(instr.id, {
      id: instr.id,
      instance: methods,
      onDestroy: instr.factory.onDestroy
        ? () => instr.factory.onDestroy!(deps, state)
        : undefined,
    });
  }

  private resolveDeps(depIds: string[]): Record<string, unknown> {
    const deps: Record<string, unknown> = {};
    for (const id of depIds) {
      const svc = this.instances.get(id);
      if (!svc) throw new Error(`Dependency "${id}" not found`);
      deps[id] = svc.instance;
    }
    return deps;
  }

  private getServiceMap(): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const [id, svc] of this.instances) {
      map.set(id, svc.instance);
    }
    return map;
  }
}
