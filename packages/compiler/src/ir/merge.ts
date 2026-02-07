import type { AppIR } from './types';

function mergeByName<T extends { name: string }>(base: T[], partial: T[] | undefined): T[] {
  if (!partial) return base;
  const partialNames = new Set(partial.map((item) => item.name));
  const preserved = base.filter((item) => !partialNames.has(item.name));
  return [...preserved, ...partial];
}

export function mergeIR(base: AppIR, partial: Partial<AppIR>): AppIR {
  return {
    ...base,
    modules: mergeByName(base.modules, partial.modules),
    schemas: mergeByName(base.schemas, partial.schemas),
    middleware: mergeByName(base.middleware, partial.middleware),
    diagnostics: [],
  };
}
