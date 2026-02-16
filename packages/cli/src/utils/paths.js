import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT_MARKERS = ['package.json', 'vertz.config.ts', 'vertz.config.js'];
export function findProjectRoot(startDir) {
  let current = resolve(startDir ?? process.cwd());
  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (existsSync(join(current, marker))) {
        return current;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return undefined;
}
//# sourceMappingURL=paths.js.map
