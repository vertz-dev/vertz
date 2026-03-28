/**
 * OG Image Generator
 *
 * Generates Open Graph images for social sharing using Satori + resvg.
 * Similar to Next.js `ImageResponse` — define the image as a component,
 * render to SVG via Satori, convert to PNG via resvg.
 *
 * Usage: bun run scripts/generate-og.ts
 */
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

const WIDTH = 1200;
const HEIGHT = 630;

// ── Font loading ────────────────────────────────────────────
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    family: `${family}:wght@${weight}`,
    display: 'swap',
  });
  const cssUrl = `https://fonts.googleapis.com/css2?${params}`;

  // Fetch CSS with a User-Agent that returns ttf (Satori supports woff/ttf/otf, not woff2)
  const css = await fetch(cssUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' },
  }).then((r) => r.text());

  // Extract the first font file URL from the CSS
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match?.[1]) {
    throw new Error(`Could not extract font URL for ${family}:${weight}`);
  }

  return fetch(match[1]).then((r) => r.arrayBuffer());
}

// ── Logo SVG as data URI ────────────────────────────────────
// Symbol-only logo from vertz-logo.tsx (viewBox 0 0 262 232)
const logoSvg = `<svg viewBox="0 0 262 232" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M137.986 232L117 203L185.467 113.67L155.731 66H262L137.986 232Z" fill="white"/>
  <path d="M110.277 66H16L96.5 174.5L141.365 113.67L110.277 66Z" fill="white"/>
</svg>`;
const logoDataUri = `data:image/svg+xml,${encodeURIComponent(logoSvg)}`;

// ── OG Image component ─────────────────────────────────────
// Satori uses React-element-like objects. No React needed.
function OGImage() {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '80px',
        backgroundColor: '#111110',
        position: 'relative',
        overflow: 'hidden',
      },
      children: [
        // Background glow (terracotta)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              top: '50%',
              right: '-100px',
              width: '600px',
              height: '600px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(200,69,27,0.08) 0%, transparent 70%)',
            },
          },
        },
        // Background glow (warm)
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '-200px',
              left: '100px',
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(200,69,27,0.04) 0%, transparent 70%)',
            },
          },
        },
        // Logo
        {
          type: 'img',
          props: {
            src: logoDataUri,
            width: 70,
            height: 62,
            style: { marginBottom: '40px' },
          },
        },
        // Headline line 1
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'DM Serif Display',
              fontSize: '72px',
              color: '#E8E4DC',
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
            },
            children: 'The agent-native',
          },
        },
        // Headline line 2
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'DM Serif Display',
              fontSize: '72px',
              color: '#6B6560',
              lineHeight: 1.1,
              letterSpacing: '-0.025em',
              marginBottom: '28px',
            },
            children: 'framework.',
          },
        },
        // Subtitle
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'DM Sans',
              fontSize: '24px',
              color: '#6B6560',
              lineHeight: 1.5,
              maxWidth: '700px',
            },
            children: 'One schema derives your database, API, and UI. Fully typed end-to-end.',
          },
        },
        // Bottom bar: badge + URL
        {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              bottom: '60px',
              left: '80px',
              right: '80px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            },
            children: [
              // Badge
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
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: '#C8451B',
                        },
                      },
                    },
                    {
                      type: 'span',
                      props: {
                        style: {
                          fontFamily: 'JetBrains Mono',
                          fontSize: '18px',
                          color: '#6B6560',
                        },
                        children: 'Canary',
                      },
                    },
                  ],
                },
              },
              // URL
              {
                type: 'span',
                props: {
                  style: {
                    fontFamily: 'JetBrains Mono',
                    fontSize: '20px',
                    color: '#4A4540',
                  },
                  children: 'vertz.dev',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

// ── Main ────────────────────────────────────────────────────
async function main() {
  console.log('Loading fonts...');
  const [dmSerifDisplay, dmSans, jetbrainsMono] = await Promise.all([
    loadGoogleFont('DM Serif Display', 400),
    loadGoogleFont('DM Sans', 400),
    loadGoogleFont('JetBrains Mono', 400),
  ]);

  console.log('Rendering SVG...');
  const svg = await satori(OGImage() as React.ReactNode, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: 'DM Serif Display', data: dmSerifDisplay, weight: 400, style: 'normal' },
      { name: 'DM Sans', data: dmSans, weight: 400, style: 'normal' },
      { name: 'JetBrains Mono', data: jetbrainsMono, weight: 400, style: 'normal' },
    ],
  });

  console.log('Converting to PNG...');
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  const png = resvg.render().asPng();

  const outPath = `${import.meta.dir}/../public/og.png`;
  await Bun.write(outPath, png);
  console.log(`✓ Generated OG image: public/og.png (${(png.byteLength / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error('Failed to generate OG image:', err);
  process.exit(1);
});
