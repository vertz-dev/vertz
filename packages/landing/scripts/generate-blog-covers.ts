/**
 * Generate per-post cover images for the blog using Satori + resvg.
 *
 * Reads every .mdx in content/blog/, extracts YAML frontmatter (title, slug,
 * description, tags), and renders a 1200×630 PNG into public/blog/covers/<slug>.png.
 *
 * Usage: bun scripts/generate-blog-covers.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1200;
const HEIGHT = 630;

interface Frontmatter {
  title: string;
  slug: string;
  description: string;
  tags: string[];
}

function parseFrontmatter(source: string, fallbackSlug: string): Frontmatter | null {
  const match = source.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const yaml = match[1] ?? '';
  const get = (key: string): string | undefined => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
    const m = yaml.match(re);
    if (!m) return undefined;
    let v = (m[1] ?? '').trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
      v = v.slice(1, -1);
    }
    return v.replace(/\\"/g, '"').replace(/\\'/g, "'");
  };
  const tagsRaw = yaml.match(/^tags:\s*\[([^\]]+)\]/m);
  const tags = tagsRaw?.[1]
    ? tagsRaw[1]
        .split(',')
        .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    : [];
  const title = get('title');
  const description = get('description');
  const slug = get('slug') ?? fallbackSlug;
  if (!title || !description) return null;
  return { title, description, slug, tags };
}

// Tag → accent color. Picks the first matching tag.
const TAG_ACCENTS: Array<{ match: RegExp; color: string; category: string }> = [
  { match: /^(ui|reactivity|compiler|forms|ssr|performance)$/, color: '#E8A838', category: 'UI' },
  { match: /^(errors|api-design)$/, color: '#D04A2E', category: 'API' },
  { match: /^(schema|types|full-stack|db)$/, color: '#3DA3A8', category: 'DATA' },
  { match: /^(auth|multi-tenancy|security)$/, color: '#7C5FD3', category: 'AUTH' },
  { match: /^(testing)$/, color: '#5FA85C', category: 'TESTING' },
  { match: /^(agents|ai|cloudflare)$/, color: '#3D7AE0', category: 'AGENTS' },
  { match: /^(llms|design)$/, color: '#C04B7A', category: 'LLMS' },
  { match: /^(runtime|framework|dx|meta)$/, color: '#C8451B', category: 'FRAMEWORK' },
];

function pickAccent(tags: string[]): { color: string; category: string } {
  for (const tag of tags) {
    for (const entry of TAG_ACCENTS) {
      if (entry.match.test(tag)) return { color: entry.color, category: entry.category };
    }
  }
  return { color: '#C8451B', category: 'VERTZ' };
}

// ── Font loading (Google Fonts, ttf variant via Googlebot UA) ──────────────
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    family: `${family}:wght@${weight}`,
    display: 'swap',
  });
  const cssUrl = `https://fonts.googleapis.com/css2?${params}`;
  const css = await fetch(cssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  }).then((r) => r.text());
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract font URL for ${family}:${weight}`);
  }
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

// ── Logo (symbol-only, from vertz-logo.tsx) ────────────────────────────────
const logoSvg = `<svg viewBox="0 0 262 232" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M137.986 232L117 203L185.467 113.67L155.731 66H262L137.986 232Z" fill="white"/>
  <path d="M110.277 66H16L96.5 174.5L141.365 113.67L110.277 66Z" fill="white"/>
</svg>`;
const logoDataUri = `data:image/svg+xml,${encodeURIComponent(logoSvg)}`;

// ── Cover component ────────────────────────────────────────────────────────
function Cover(props: { title: string; description: string; accent: string; category: string }) {
  const { title, description, accent, category } = props;
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        backgroundColor: '#111110',
        position: 'relative',
        overflow: 'hidden',
      },
      children: [
        // Accent glow (bottom-right)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '-220px',
              right: '-140px',
              width: '680px',
              height: '680px',
              borderRadius: '50%',
              background: `radial-gradient(circle, ${accent}26 0%, transparent 70%)`,
            },
          },
        },
        // Subtle grid / line accent
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '0',
              left: '0',
              width: '6px',
              height: '100%',
              background: `linear-gradient(180deg, transparent 0%, ${accent} 40%, ${accent} 60%, transparent 100%)`,
            },
          },
        },
        // Top row: logo + category tag
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
            children: [
              {
                type: 'img',
                props: {
                  src: logoDataUri,
                  width: 52,
                  height: 46,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 18px',
                    border: `1px solid ${accent}66`,
                    borderRadius: '999px',
                    background: `${accent}14`,
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: accent,
                        },
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontFamily: 'JetBrains Mono',
                          fontSize: '16px',
                          color: '#E8E4DC',
                          letterSpacing: '0.08em',
                        },
                        children: category,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        // Middle: title + description
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
              maxWidth: '1000px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'DM Serif Display',
                    fontSize: title.length > 40 ? '64px' : '76px',
                    color: '#E8E4DC',
                    lineHeight: 1.08,
                    letterSpacing: '-0.025em',
                  },
                  children: title,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'DM Sans',
                    fontSize: '22px',
                    color: '#8A8680',
                    lineHeight: 1.45,
                    maxWidth: '880px',
                  },
                  children:
                    description.length > 160
                      ? description.slice(0, 157).trimEnd() + '…'
                      : description,
                },
              },
            ],
          },
        },
        // Bottom: vertz.dev/blog
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
            children: [
              {
                type: 'span',
                props: {
                  style: {
                    fontFamily: 'JetBrains Mono',
                    fontSize: '18px',
                    color: '#4A4540',
                  },
                  children: 'vertz.dev/blog',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          width: '40px',
                          height: '2px',
                          backgroundColor: accent,
                        },
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontFamily: 'JetBrains Mono',
                          fontSize: '16px',
                          color: '#6B6560',
                          letterSpacing: '0.04em',
                        },
                        children: 'The agent-native framework',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const contentDir = join(projectRoot, 'content', 'blog');
  const outDir = join(projectRoot, 'public', 'blog', 'covers');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log('Loading fonts…');
  const [dmSerif, dmSans, jetbrainsMono] = await Promise.all([
    loadGoogleFont('DM Serif Display', 400),
    loadGoogleFont('DM Sans', 400),
    loadGoogleFont('JetBrains Mono', 400),
  ]);

  const fonts: Parameters<typeof satori>[1]['fonts'] = [
    { name: 'DM Serif Display', data: dmSerif, weight: 400, style: 'normal' },
    { name: 'DM Sans', data: dmSans, weight: 400, style: 'normal' },
    { name: 'JetBrains Mono', data: jetbrainsMono, weight: 400, style: 'normal' },
  ];

  const entries = readdirSync(contentDir).filter((f) => extname(f) === '.mdx');
  let count = 0;
  for (const entry of entries) {
    const source = readFileSync(join(contentDir, entry), 'utf-8');
    const fallbackSlug = basename(entry, '.mdx').replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const fm = parseFrontmatter(source, fallbackSlug);
    if (!fm) {
      console.warn(`skip ${entry}: could not parse frontmatter`);
      continue;
    }
    const accent = pickAccent(fm.tags);
    const svg = await satori(
      Cover({
        title: fm.title,
        description: fm.description,
        accent: accent.color,
        category: accent.category,
      }) as unknown as Parameters<typeof satori>[0],
      { width: WIDTH, height: HEIGHT, fonts },
    );
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } }).render().asPng();
    const out = join(outDir, `${fm.slug}.png`);
    writeFileSync(out, png);
    const kb = (png.byteLength / 1024).toFixed(1);
    console.log(`✓ ${fm.slug}.png  (${accent.category.padEnd(9)} · ${kb} KB)`);
    count++;
  }
  console.log(`\nGenerated ${count} cover${count === 1 ? '' : 's'} → public/blog/covers/`);
}

main().catch((err) => {
  console.error('Failed to generate blog covers:', err);
  process.exit(1);
});
