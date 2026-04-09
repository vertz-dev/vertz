import { describe, expect, it } from '@vertz/test';
import { createOGResponse } from '../og-response';
import type { SatoriElement } from '../types';
import { getTestFont, testFonts } from './test-helpers';

let font: ArrayBuffer;
const element: SatoriElement = {
  type: 'div',
  props: {
    style: { display: 'flex', width: '100%', height: '100%', backgroundColor: '#000' },
    children: 'Hello',
  },
};

describe('createOGResponse', () => {
  it('returns a Response with Content-Type image/png', async () => {
    if (!font) font = await getTestFont();

    const response = await createOGResponse(element, {
      fonts: testFonts(font),
      width: 400,
      height: 200,
    });

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('returns a Response with default Cache-Control', async () => {
    if (!font) font = await getTestFont();

    const response = await createOGResponse(element, {
      fonts: testFonts(font),
      width: 400,
      height: 200,
    });

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('accepts custom cacheMaxAge', async () => {
    if (!font) font = await getTestFont();

    const response = await createOGResponse(element, {
      fonts: testFonts(font),
      width: 400,
      height: 200,
      cacheMaxAge: 3600,
    });

    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('produces a body with valid PNG data', async () => {
    if (!font) font = await getTestFont();

    const response = await createOGResponse(element, {
      fonts: testFonts(font),
      width: 400,
      height: 200,
    });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });

  it('accepts custom status code', async () => {
    if (!font) font = await getTestFont();

    const response = await createOGResponse(element, {
      fonts: testFonts(font),
      width: 400,
      height: 200,
      status: 201,
    });

    expect(response.status).toBe(201);
  });

  it('applies custom headers', async () => {
    if (!font) font = await getTestFont();

    const response = await createOGResponse(element, {
      fonts: testFonts(font),
      width: 400,
      height: 200,
      headers: { 'X-Custom': 'test-value' },
    });

    expect(response.headers.get('X-Custom')).toBe('test-value');
    // Built-in headers should still be present
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });
});
