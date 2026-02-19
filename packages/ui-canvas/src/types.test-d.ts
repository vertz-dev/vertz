import { describe, expectTypeOf, it } from 'vitest';
import type { ContainerProps, GraphicsProps, SpriteProps, TextProps } from './types';
import type { MaybeAccessor } from './unwrap';

describe('Type Safety: Canvas intrinsic prop types', () => {
  describe('GraphicsProps', () => {
    it('requires a draw function', () => {
      expectTypeOf<GraphicsProps['draw']>().toBeFunction();
    });

    it('forbids children', () => {
      expectTypeOf<GraphicsProps['children']>().toEqualTypeOf<never | undefined>();
    });

    it('accepts MaybeAccessor for transform props', () => {
      expectTypeOf<GraphicsProps['x']>().toEqualTypeOf<MaybeAccessor<number> | undefined>();
    });
  });

  describe('ContainerProps', () => {
    it('accepts children as CanvasChild or array', () => {
      expectTypeOf<ContainerProps>().toHaveProperty('children');
    });

    it('accepts MaybeAccessor for transform props', () => {
      expectTypeOf<ContainerProps['x']>().toEqualTypeOf<MaybeAccessor<number> | undefined>();
    });
  });

  describe('SpriteProps', () => {
    it('requires texture as MaybeAccessor<string>', () => {
      expectTypeOf<SpriteProps['texture']>().toEqualTypeOf<MaybeAccessor<string>>();
    });

    it('accepts MaybeAccessor for anchor', () => {
      expectTypeOf<SpriteProps['anchor']>().toEqualTypeOf<MaybeAccessor<number> | undefined>();
    });
  });

  describe('TextProps', () => {
    it('requires text as MaybeAccessor<string>', () => {
      expectTypeOf<TextProps['text']>().toEqualTypeOf<MaybeAccessor<string>>();
    });

    it('accepts optional style', () => {
      expectTypeOf<TextProps>().toHaveProperty('style');
    });
  });
});
