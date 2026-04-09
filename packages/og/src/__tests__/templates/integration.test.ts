import { describe, expect, it } from '@vertz/test';
import { generateOGImage } from '../../generate';
import { OGTemplate } from '../../templates';
import { getTestFont, testFonts } from '../test-helpers';

let font: ArrayBuffer;

describe('Template → generateOGImage integration', () => {
  it('OGTemplate.Card produces a valid PNG', async () => {
    if (!font) font = await getTestFont();

    const element = OGTemplate.Card({
      title: 'Integration Test',
      description: 'Testing the pipeline',
    });
    const png = await generateOGImage(element, { fonts: testFonts(font), width: 600, height: 315 });

    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png.length).toBeGreaterThan(100);
  });

  it('OGTemplate.Hero produces a valid PNG', async () => {
    if (!font) font = await getTestFont();

    const element = OGTemplate.Hero({ title: 'Hero Test', subtitle: 'With subtitle' });
    const png = await generateOGImage(element, { fonts: testFonts(font), width: 600, height: 315 });

    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
  });

  it('OGTemplate.Minimal produces a valid PNG', async () => {
    if (!font) font = await getTestFont();

    const element = OGTemplate.Minimal({ title: 'Minimal Test', accent: '#e11d48' });
    const png = await generateOGImage(element, { fonts: testFonts(font), width: 600, height: 315 });

    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
  });
});
