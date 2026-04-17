import { describe, expect, it } from '@vertz/test';
import { UNITLESS_PROPERTIES, isUnitless } from '../unitless-properties';

describe('UNITLESS_PROPERTIES', () => {
  it('contains common unitless CSS properties', () => {
    expect(UNITLESS_PROPERTIES.has('opacity')).toBe(true);
    expect(UNITLESS_PROPERTIES.has('zIndex')).toBe(true);
    expect(UNITLESS_PROPERTIES.has('lineHeight')).toBe(true);
    expect(UNITLESS_PROPERTIES.has('fontWeight')).toBe(true);
    expect(UNITLESS_PROPERTIES.has('flex')).toBe(true);
  });

  it('excludes dimensional properties', () => {
    expect(UNITLESS_PROPERTIES.has('padding')).toBe(false);
    expect(UNITLESS_PROPERTIES.has('margin')).toBe(false);
    expect(UNITLESS_PROPERTIES.has('width')).toBe(false);
    expect(UNITLESS_PROPERTIES.has('height')).toBe(false);
  });

  it('uses camelCase keys', () => {
    expect(UNITLESS_PROPERTIES.has('line-height')).toBe(false);
    expect(UNITLESS_PROPERTIES.has('z-index')).toBe(false);
  });
});

describe('isUnitless', () => {
  it('returns true for unitless properties', () => {
    expect(isUnitless('opacity')).toBe(true);
    expect(isUnitless('zIndex')).toBe(true);
  });

  it('returns false for dimensional properties', () => {
    expect(isUnitless('padding')).toBe(false);
    expect(isUnitless('margin')).toBe(false);
  });

  it('returns false for unknown properties', () => {
    expect(isUnitless('notARealProperty')).toBe(false);
  });
});
