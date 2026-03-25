/** Parsed frontmatter result. */
export interface FrontmatterResult {
  data: Record<string, string>;
  content: string;
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)---\s*(?:\n|$)/;

/**
 * Parse YAML-like frontmatter from MDX content.
 * Supports simple `key: value` pairs and YAML folded scalars (`>`).
 * Returns extracted data and the content with frontmatter stripped.
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const match = FRONTMATTER_RE.exec(content);
  if (!match) {
    return { data: {}, content };
  }

  const raw = match[1] ?? '';
  const rest = content.slice(match[0].length);
  const data: Record<string, string> = {};

  const lines = raw.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const kvMatch = /^(\w[\w-]*):\s*(.*)$/.exec(line);
    if (kvMatch) {
      const key = kvMatch[1] ?? '';
      let value = kvMatch[2] ?? '';

      // Handle YAML folded scalar: `key: >`
      if (value === '>' || value === '|') {
        const parts: string[] = [];
        i++;
        while (i < lines.length) {
          const nextLine = lines[i] ?? '';
          if (/^\s+/.test(nextLine)) {
            parts.push(nextLine.trim());
            i++;
          } else {
            break;
          }
        }
        value = parts.join(' ');
      } else {
        i++;
      }

      if (key) {
        data[key] = value;
      }
    } else {
      i++;
    }
  }

  return { data, content: rest };
}
