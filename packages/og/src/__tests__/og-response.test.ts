import { describe, expect, it } from 'bun:test';
import { OGResponse } from '../og-response';
import type { SatoriElement } from '../types';

async function getTestFont(): Promise<ArrayBuffer> {
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
const element: SatoriElement = {
  type: 'div',
  props: {
    style: { display: 'flex', width: '100%', height: '100%', backgroundColor: '#000' },
    children: 'Hello',
  },
};

describe('OGResponse', () => {
  it('returns a Response with Content-Type image/png', async () => {
    if (!testFont) testFont = await getTestFont();

    const response = await OGResponse(element, {
      fonts: [{ data: testFont, name: 'Noto Sans' }],
      width: 400,
      height: 200,
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('returns a Response with default Cache-Control', async () => {
    if (!testFont) testFont = await getTestFont();

    const response = await OGResponse(element, {
      fonts: [{ data: testFont, name: 'Noto Sans' }],
      width: 400,
      height: 200,
    });

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('accepts custom cacheMaxAge', async () => {
    if (!testFont) testFont = await getTestFont();

    const response = await OGResponse(element, {
      fonts: [{ data: testFont, name: 'Noto Sans' }],
      width: 400,
      height: 200,
      cacheMaxAge: 3600,
    });

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('produces a body with valid PNG data', async () => {
    if (!testFont) testFont = await getTestFont();

    const response = await OGResponse(element, {
      fonts: [{ data: testFont, name: 'Noto Sans' }],
      width: 400,
      height: 200,
    });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x4e); // N
    expect(bytes[3]).toBe(0x47); // G
  });

  it('accepts custom status code', async () => {
    if (!testFont) testFont = await getTestFont();

    const response = await OGResponse(element, {
      fonts: [{ data: testFont, name: 'Noto Sans' }],
      width: 400,
      height: 200,
      status: 201,
    });

    expect(response.status).toBe(201);
  });
});
