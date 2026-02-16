import { toKebabCase, toPascalCase } from './naming';
export function generateService(name, moduleName, sourceDir) {
  const kebab = toKebabCase(name);
  const pascal = toPascalCase(kebab);
  const moduleKebab = toKebabCase(moduleName);
  const content = `export function create${pascal}Service() {
  return {};
}
`;
  return [
    {
      path: `${sourceDir}/modules/${moduleKebab}/${kebab}.service.ts`,
      content,
    },
  ];
}
//# sourceMappingURL=service.js.map
