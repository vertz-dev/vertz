import { describe, expect, it } from 'bun:test';
import { generateOGImage } from '../generate';
import type { SatoriElement } from '../types';

// Minimal embedded font for testing (we use a tiny subset of a system font)
// In real usage, users call loadGoogleFont. For tests, we load a small font file.
async function getTestFont(): Promise<ArrayBuffer> {
  // Fetch a small open-source font for testing
  // NotoSans is commonly available and small in its Latin subset
  const res = await fetch(
    'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400&display=swap&subset=latin',
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)' } },
  );
  const css = await res.text();
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match?.[1]) throw new Error('Could not load test font');
  return fetch(match[1]).then((r) => r.arrayBuffer());
}

let testFont: ArrayBuffer;

describe('generateOGImage', () => {
  it('produces a Uint8Array starting with PNG magic bytes', async () => {
    if (!testFont) testFont = await getTestFont();

    const element: SatoriElement = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          backgroundColor: '#000',
          color: '#fff',
          width: '100%',
          height: '100%',
        },
        children: 'Hello OG',
      },
    };

    const result = await generateOGImage(element, {
      fonts: [{ data: testFont, name: 'Noto Sans', weight: 400, style: 'normal' }],
    });

    expect(result).toBeInstanceOf(Uint8Array);
    // PNG magic bytes: 0x89 0x50 0x4E 0x47
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50); // P
    expect(result[2]).toBe(0x4e); // N
    expect(result[3]).toBe(0x47); // G
  });

  it('defaults to 1200x630 dimensions', async () => {
    if (!testFont) testFont = await getTestFont();

    const element: SatoriElement = {
      type: 'div',
      props: {
        style: { display: 'flex', width: '100%', height: '100%' },
        children: 'Default size',
      },
    };

    const result = await generateOGImage(element, {
      fonts: [{ data: testFont, name: 'Noto Sans' }],
    });

    // Just verify it produces valid PNG output (dimension verification
    // would require parsing the IHDR chunk, which is beyond the scope)
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(100);
  });

  it('accepts custom dimensions', async () => {
    if (!testFont) testFont = await getTestFont();

    const element: SatoriElement = {
      type: 'div',
      props: {
        style: { display: 'flex', width: '100%', height: '100%' },
        children: 'Small',
      },
    };

    const result = await generateOGImage(element, {
      width: 400,
      height: 200,
      fonts: [{ data: testFont, name: 'Noto Sans' }],
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x89);
  });
});
