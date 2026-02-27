import { describe, expect, it } from 'bun:test';
import { grayTokens } from '../tokens/gray';
import { neutralTokens } from '../tokens/neutral';
import { slateTokens } from '../tokens/slate';
import { stoneTokens } from '../tokens/stone';
import { zincTokens } from '../tokens/zinc';
import type { PaletteTokens } from '../types';

const REQUIRED_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const;

function testPalette(name: string, tokens: PaletteTokens): void {
  describe(`${name} palette`, () => {
    it('has all required semantic token keys', () => {
      for (const token of REQUIRED_TOKENS) {
        expect(tokens[token]).toBeDefined();
      }
    });

    it('every token has DEFAULT and _dark values', () => {
      for (const token of REQUIRED_TOKENS) {
        const values = tokens[token];
        expect(values?.DEFAULT).toBeDefined();
        expect(values?._dark).toBeDefined();
      }
    });

    it('all values are valid CSS color strings', () => {
      for (const token of REQUIRED_TOKENS) {
        const values = tokens[token];
        expect(values?.DEFAULT).toMatch(/^hsl\(/);
        expect(values?._dark).toMatch(/^hsl\(/);
      }
    });
  });
}

testPalette('zinc', zincTokens);
testPalette('slate', slateTokens);
testPalette('stone', stoneTokens);
testPalette('neutral', neutralTokens);
testPalette('gray', grayTokens);

describe('palettes are distinct', () => {
  it('zinc and slate have different primary values', () => {
    expect(zincTokens.primary?.DEFAULT).not.toBe(slateTokens.primary?.DEFAULT);
  });

  it('zinc and stone have different foreground values', () => {
    expect(zincTokens.foreground?.DEFAULT).not.toBe(stoneTokens.foreground?.DEFAULT);
  });

  it('neutral and gray have different border values', () => {
    expect(neutralTokens.border?.DEFAULT).not.toBe(grayTokens.border?.DEFAULT);
  });
});
