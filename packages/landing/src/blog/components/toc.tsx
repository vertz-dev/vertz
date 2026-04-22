import { css, onMount, token } from '@vertz/ui';

// ── Pure helpers (tested in isolation) ────────────────────────

/** Decode the small set of HTML entities MDX's stringified output can produce. */
function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

/** URL-slug for a heading. Non-ASCII letters are folded to ASCII. */
export function slugify(input: string): string {
  return decodeHtmlEntities(input)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface TocEntry {
  level: 2 | 3;
  text: string;
  id: string;
}

/**
 * Extract h2 and h3 headings from an HTML string (the blog's pre-rendered
 * MDX body). Respects an explicit `id="..."` attribute when present and
 * disambiguates duplicate slugs with a numeric suffix.
 */
export function extractHeadingsFromHtml(html: string): TocEntry[] {
  const re = /<h([23])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const entries: TocEntry[] = [];
  const seen = new Map<string, number>();
  let match: RegExpExecArray | null = re.exec(html) as RegExpExecArray | null;
  while (match !== null) {
    const level = Number(match[1]) as 2 | 3;
    const attrs = match[2] ?? '';
    const rawInner = match[3] ?? '';
    const text = rawInner.replace(/<[^>]+>/g, '').trim();
    const idAttr = /\bid\s*=\s*"([^"]+)"/i.exec(attrs);
    const baseId = idAttr?.[1] ?? slugify(text);
    let id = baseId;
    const count = seen.get(baseId) ?? 0;
    if (count > 0) id = `${baseId}-${count + 1}`;
    seen.set(baseId, count + 1);
    entries.push({ level, text, id });
    match = re.exec(html);
  }
  return entries;
}

// ── Component ─────────────────────────────────────────────────

const s = css({
  root: {
    position: 'sticky',
    top: '120px',
    paddingTop: token.spacing[2],
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: token.color.gray[500],
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
  },
  heading: {
    fontWeight: '600',
    color: token.color.gray[400],
    marginBottom: token.spacing[3],
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: token.spacing[2],
  },
  itemLink: {
    color: token.color.gray[500],
    textDecoration: 'none',
    textTransform: 'none',
    letterSpacing: '0',
    fontSize: token.font.size.sm,
    lineHeight: '1.4',
    display: 'block',
    paddingLeft: '0',
    transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': { color: token.color.gray[300] },
    '&[data-active]': { color: token.color.gray[100] },
  },
  nested: {
    paddingLeft: token.spacing[4],
  },
});

export interface TocProps {
  /** Post body HTML — we re-extract headings rather than accepting an array so
   *  Phase 4's component-override path can reuse the same input shape. */
  html: string;
  /** Element whose headings to observe for "active" highlighting. */
  target: HTMLElement;
}

export function Toc({ html, target }: TocProps) {
  const entries = extractHeadingsFromHtml(html);

  // Progressive enhancement: the "active" heading state only works in the
  // browser with IntersectionObserver. SSR renders the TOC without active
  // state; the DOM shim here has `querySelector` on document but not always
  // on every arbitrary element, so we guard generously.
  onMount(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    if (typeof target?.querySelector !== 'function') return;

    const ids = entries.map((e) => e.id);
    const nodes = ids
      .map((id) => target.querySelector(`[id="${id}"]`))
      .filter((n): n is Element => n !== null);

    const links = new Map<string, HTMLAnchorElement>();
    const doc = target.ownerDocument ?? window.document;
    for (const a of doc.querySelectorAll<HTMLAnchorElement>('[data-toc-link]')) {
      const id = a.getAttribute('data-toc-link');
      if (id) links.set(id, a);
    }

    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          const id = record.target.getAttribute('id');
          if (!id) continue;
          const link = links.get(id);
          if (!link) continue;
          if (record.isIntersecting) link.dataset.active = 'true';
          else delete link.dataset.active;
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    );
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  });

  if (entries.length === 0) return <div className={s.root} aria-hidden="true" />;

  return (
    <nav className={s.root} aria-label="On this page">
      <div className={s.heading}>On this page</div>
      <ul className={s.list}>
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={entry.level === 3 ? s.nested : undefined}
          >
            <a
              href={`#${entry.id}`}
              data-toc-link={entry.id}
              className={s.itemLink}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
