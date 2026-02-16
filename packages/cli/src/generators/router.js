import { toKebabCase, toPascalCase } from './naming';
export function generateRouter(name, moduleName, sourceDir) {
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
//# sourceMappingURL=router.js.map
