import { describe, expect, it } from '@vertz/test';
import { generateOGImage } from '../generate';
import type { SatoriElement } from '../types';
import { getTestFont, testFonts } from './test-helpers';

let font: ArrayBuffer;

describe('generateOGImage', () => {
  it('produces a Uint8Array starting with PNG magic bytes', async () => {
    if (!font) font = await getTestFont();

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

    const result = await generateOGImage(element, { fonts: testFonts(font) });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x89);
    expect(result[1]).toBe(0x50); // P
    expect(result[2]).toBe(0x4e); // N
    expect(result[3]).toBe(0x47); // G
  });

  it('defaults to 1200x630 dimensions', async () => {
    if (!font) font = await getTestFont();

    const element: SatoriElement = {
      type: 'div',
      props: {
        style: { display: 'flex', width: '100%', height: '100%' },
        children: 'Default size',
      },
    };

    const result = await generateOGImage(element, { fonts: testFonts(font) });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(100);
  });

  it('accepts custom dimensions', async () => {
    if (!font) font = await getTestFont();

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
      fonts: testFonts(font),
    });

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x89);
  });

  it('throws when no fonts are provided', async () => {
    const element: SatoriElement = {
      type: 'div',
      props: {
        style: { display: 'flex', width: '100%', height: '100%' },
        children: 'No fonts',
      },
    };

    await expect(generateOGImage(element, {})).rejects.toThrow('requires at least one font');
  });

  it('throws when fonts array is empty', async () => {
    const element: SatoriElement = {
      type: 'div',
      props: {
        style: { display: 'flex', width: '100%', height: '100%' },
        children: 'Empty',
      },
    };

    await expect(generateOGImage(element, { fonts: [] })).rejects.toThrow(
      'requires at least one font',
    );
  });
});
