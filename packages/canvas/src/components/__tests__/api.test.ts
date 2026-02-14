import { describe, it, expect } from 'vitest';
import { Canvas, Sprite, useTicker, CanvasContext, bindProp, bindPropCustom } from '../../index';

describe('Public API exports', () => {
  it('exports Canvas', () => expect(typeof Canvas).toBe('function'));
  it('exports Sprite', () => expect(typeof Sprite).toBe('function'));
  it('exports useTicker', () => expect(typeof useTicker).toBe('function'));
  it('exports CanvasContext', () => expect(CanvasContext).toBeDefined());
  it('exports bindProp', () => expect(typeof bindProp).toBe('function'));
  it('exports bindPropCustom', () => expect(typeof bindPropCustom).toBe('function'));
});
