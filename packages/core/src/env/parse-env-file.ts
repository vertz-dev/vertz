export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Strip optional `export` prefix
    const stripped = line.startsWith('export ') ? line.slice(7).trimStart() : line;

    // Must contain `=`
    const eqIndex = stripped.indexOf('=');
    if (eqIndex === -1) continue;

    const key = stripped.slice(0, eqIndex).trim();
    const rawValue = stripped.slice(eqIndex + 1);

    result[key] = parseValue(rawValue);
  }

  return result;
}

function parseValue(raw: string): string {
  const trimmed = raw.trim();

  // Single-quoted: literal, no escape processing
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  // Double-quoted: process escape sequences
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  // Unquoted: strip inline comments (` #`) and trim
  const commentIndex = trimmed.indexOf(' #');
  const value = commentIndex !== -1 ? trimmed.slice(0, commentIndex) : trimmed;
  return value.trimEnd();
}
