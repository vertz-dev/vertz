import { describe, expect, it } from 'bun:test';
import { generateOGImage } from '../../generate';
import { OGTemplate } from '../../templates';

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
const fonts = () => [
  { data: testFont, name: 'Noto Sans', weight: 400 as const, style: 'normal' as const },
];

describe('Template → generateOGImage integration', () => {
  it('OGTemplate.Card produces a valid PNG', async () => {
    if (!testFont) testFont = await getTestFont();

    const element = OGTemplate.Card({
      title: 'Integration Test',
      description: 'Testing the pipeline',
    });
    const png = await generateOGImage(element, { fonts: fonts(), width: 600, height: 315 });

    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png.length).toBeGreaterThan(100);
  });

  it('OGTemplate.Hero produces a valid PNG', async () => {
    if (!testFont) testFont = await getTestFont();

    const element = OGTemplate.Hero({ title: 'Hero Test', subtitle: 'With subtitle' });
    const png = await generateOGImage(element, { fonts: fonts(), width: 600, height: 315 });

    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
  });

  it('OGTemplate.Minimal produces a valid PNG', async () => {
    if (!testFont) testFont = await getTestFont();

    const element = OGTemplate.Minimal({ title: 'Minimal Test', accent: '#e11d48' });
    const png = await generateOGImage(element, { fonts: fonts(), width: 600, height: 315 });

    expect(png).toBeInstanceOf(Uint8Array);
    expect(png[0]).toBe(0x89);
  });
});
