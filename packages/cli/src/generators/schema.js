import { toKebabCase, toPascalCase } from './naming';
export function generateSchema(name, moduleName, sourceDir) {
  const kebab = toKebabCase(name);
  const pascal = toPascalCase(kebab);
  const moduleKebab = toKebabCase(moduleName);
  const content = `import { createSchema } from '@vertz/server';
import { z } from '@vertz/schema';

export const ${pascal}Schema = createSchema('${pascal}', z.object({
  // Add your schema fields here
}));
`;
  return [
    {
      path: `${sourceDir}/modules/${moduleKebab}/schemas/${kebab}.schema.ts`,
      content,
    },
  ];
}
//# sourceMappingURL=schema.js.map
