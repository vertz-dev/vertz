function splitWords(input) {
  return input
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/)
    .filter(Boolean);
}
export function toPascalCase(input) {
  return splitWords(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}
export function toCamelCase(input) {
  const pascal = toPascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
export function toKebabCase(input) {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join('-');
}
export function toSnakeCase(input) {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join('_');
}
//# sourceMappingURL=naming.js.map
