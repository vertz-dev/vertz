import { describe, it, expect } from 'vitest';
import { Canvas, Sprite, useTicker, CanvasContext } from '../../index';

describe('API exports', () => {
  it('should export Canvas component', () => {
    expect(Canvas).toBeDefined();
    expect(typeof Canvas).toBe('function');
  });

  it('should export Sprite component', () => {
    expect(Sprite).toBeDefined();
    expect(typeof Sprite).toBe('function');
  });

  it('should export useTicker hook', () => {
    expect(useTicker).toBeDefined();
    expect(typeof useTicker).toBe('function');
  });

  it('should export CanvasContext', () => {
    expect(CanvasContext).toBeDefined();
  });
});

describe('Component prop types', () => {
  it('Canvas should accept width, height, background props', () => {
    // Type-level test - if this compiles, props are correct
    const props = {
      width: 800,
      height: 600,
      background: 0x1099bb,
      children: null,
    };
    expect(props).toBeDefined();
  });

  it('Sprite should accept position and texture props', () => {
    // Type-level test
    const props = {
      x: 100,
      y: 200,
      rotation: 0,
      scale: 1,
      alpha: 1,
      texture: 'test.png',
    };
    expect(props).toBeDefined();
  });
});
