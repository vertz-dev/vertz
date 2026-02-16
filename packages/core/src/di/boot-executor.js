import { makeImmutable } from '../immutability';
export class BootExecutor {
  services = new Map();
  shutdownOrder = [];
  async execute(sequence) {
    for (const instruction of sequence.instructions) {
      if (instruction.type === 'service') {
        await this.bootService(instruction);
      }
    }
    this.shutdownOrder = sequence.shutdownOrder;
    return this.buildServiceMap();
  }
  async shutdown() {
    for (const id of this.shutdownOrder) {
      const entry = this.services.get(id);
      if (entry?.onDestroy) await entry.onDestroy();
    }
    this.services.clear();
  }
  async bootService(instr) {
    const deps = makeImmutable(this.resolveDeps(instr.deps), 'deps');
    // Parse options with defaults from schema
    let options = {};
    if (instr.factory.options) {
      const parsed = instr.factory.options.safeParse(instr.options ?? {});
      if (parsed.success) {
        options = parsed.data;
      } else {
        throw new Error(
          `Invalid options for service ${instr.id}: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        );
      }
    }
    // Parse env with defaults from schema
    let env = {};
    if (instr.factory.env) {
      const parsed = instr.factory.env.safeParse(instr.env ?? {});
      if (parsed.success) {
        env = parsed.data;
      } else {
        throw new Error(
          `Invalid env for service ${instr.id}: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        );
      }
    }
    const state = instr.factory.onInit ? await instr.factory.onInit(deps, options, env) : undefined;
    this.services.set(instr.id, {
      methods: instr.factory.methods(deps, state, options, env),
      onDestroy: instr.factory.onDestroy ? () => instr.factory.onDestroy?.(deps, state) : undefined,
    });
  }
  resolveDeps(depIds) {
    const deps = {};
    for (const id of depIds) {
      const entry = this.services.get(id);
      if (!entry) throw new Error(`Dependency "${id}" not found`);
      deps[id] = entry.methods;
    }
    return deps;
  }
  buildServiceMap() {
    const map = new Map();
    for (const [id, entry] of this.services) {
      map.set(id, entry.methods);
    }
    return map;
  }
}
//# sourceMappingURL=boot-executor.js.map
