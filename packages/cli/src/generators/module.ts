import type { GeneratedFile } from '../config/defaults';
import { toKebabCase, toPascalCase } from './naming';

export function generateModule(name: string, sourceDir: string): GeneratedFile[] {
  const kebab = toKebabCase(name);
  const pascal = toPascalCase(kebab);
  const dir = `${sourceDir}/modules/${kebab}`;

  const moduleDefContent = `import { createModuleDef } from '@vertz/server';

export const ${pascal}ModuleDef = createModuleDef('${kebab}');
`;

  const moduleContent = `import { createModule } from '@vertz/server';
import { ${pascal}ModuleDef } from './${kebab}.module-def';

export const ${pascal}Module = createModule(${pascal}ModuleDef, (m) => {
  return m;
});
`;

  return [
    { path: `${dir}/${kebab}.module-def.ts`, content: moduleDefContent },
    { path: `${dir}/${kebab}.module.ts`, content: moduleContent },
  ];
}
