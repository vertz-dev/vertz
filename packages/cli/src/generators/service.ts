import type { GeneratedFile } from '../config/defaults';
import { toKebabCase, toPascalCase } from './naming';

export function generateService(
  name: string,
  moduleName: string,
  sourceDir: string,
): GeneratedFile[] {
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
