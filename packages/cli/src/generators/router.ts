import type { GeneratedFile } from '../config/defaults';
import { toKebabCase, toPascalCase } from './naming';

export function generateRouter(
  name: string,
  moduleName: string,
  sourceDir: string,
): GeneratedFile[] {
  const kebab = toKebabCase(name);
  const pascal = toPascalCase(kebab);
  const moduleKebab = toKebabCase(moduleName);

  const content = `import { createRouter } from '@vertz/server';
import { ${pascal}ModuleDef } from './${moduleKebab}.module-def';

export const ${kebab}Router = createRouter(${pascal}ModuleDef, '/${kebab}', (r) => {
  return r;
});
`;

  return [
    {
      path: `${sourceDir}/modules/${moduleKebab}/${kebab}.router.ts`,
      content,
    },
  ];
}
