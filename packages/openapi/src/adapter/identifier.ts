function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function sanitizeIdentifier(name: string): string {
  const words = splitWords(name);

  if (words.length === 0) {
    return '_';
  }

  const [first, ...rest] = words.map((word) => word.toLowerCase());
  const camelCase = first + rest.map((word) => word[0]?.toUpperCase() + word.slice(1)).join('');

  return /^[0-9]/.test(camelCase) ? `_${camelCase}` : camelCase;
}
