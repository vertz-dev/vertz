/** A heading extracted from markdown content. */
export interface TocHeading {
  depth: number;
  text: string;
  slug: string;
}

/**
 * Convert heading text to a URL-friendly slug.
 * Lowercases, replaces non-alphanumeric (except hyphens) with hyphens,
 * collapses multiple hyphens, trims leading/trailing hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Matches markdown headings: ## Heading text
// Captures: depth (number of #), rest of line
const HEADING_RE = /^(#{2,6})\s+(.+)$/gm;

// Matches inline code backticks
const INLINE_CODE_RE = /`([^`]+)`/g;

/**
 * Extract h2–h6 headings from raw markdown/MDX content.
 * Returns heading depth, plain text (backticks stripped), and slug.
 */
export function extractHeadings(content: string): TocHeading[] {
  const headings: TocHeading[] = [];

  for (const match of content.matchAll(HEADING_RE)) {
    const hashes = match[1];
    const rawText = match[2];
    if (!hashes || !rawText) continue;

    const depth = hashes.length;
    // Strip inline code backticks
    const text = rawText.replace(INLINE_CODE_RE, '$1').trim();
    const slug = slugify(text);

    headings.push({ depth, text, slug });
  }

  return headings;
}
