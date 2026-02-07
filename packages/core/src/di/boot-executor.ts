import { makeImmutable } from '../immutability';
import type { BootSequence, ServiceBootInstruction } from '../types/boot-sequence';

interface ServiceEntry {
  methods: unknown;
  onDestroy?: () => Promise<void> | void;
}

export class BootExecutor {
  private services = new Map<string, ServiceEntry>();
  private shutdownOrder: string[] = [];

  async execute(sequence: BootSequence): Promise<Map<string, unknown>> {
    for (const instruction of sequence.instructions) {
      if (instruction.type === 'service') {
        await this.bootService(instruction);
      }
    }
    this.shutdownOrder = sequence.shutdownOrder;
    return this.buildServiceMap();
  }

  async shutdown(): Promise<void> {
    for (const id of this.shutdownOrder) {
      const entry = this.services.get(id);
      if (entry?.onDestroy) await entry.onDestroy();
    }
    this.services.clear();
  }

  private async bootService(instr: ServiceBootInstruction): Promise<void> {
    const deps = makeImmutable(this.resolveDeps(instr.deps), 'deps');
    const state = instr.factory.onInit ? await instr.factory.onInit(deps) : undefined;

    this.services.set(instr.id, {
      methods: instr.factory.methods(deps, state),
      onDestroy: instr.factory.onDestroy ? () => instr.factory.onDestroy?.(deps, state) : undefined,
    });
  }

  private resolveDeps(depIds: string[]): Record<string, unknown> {
    const deps: Record<string, unknown> = {};
    for (const id of depIds) {
      const entry = this.services.get(id);
      if (!entry) throw new Error(`Dependency "${id}" not found`);
      deps[id] = entry.methods;
    }
    return deps;
  }

  private buildServiceMap(): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const [id, entry] of this.services) {
      map.set(id, entry.methods);
    }
    return map;
  }
}
