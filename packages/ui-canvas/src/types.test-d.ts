/**
 * Type-level tests for Canvas intrinsic prop types.
 * Verified by tsc --noEmit (no test runner needed).
 */
import type { ContainerProps, GraphicsProps, SpriteProps, TextProps } from './types';
import type { MaybeAccessor } from './unwrap';

// --- GraphicsProps ---

// draw is required and must be a function
const _drawFn: GraphicsProps['draw'] = () => {};
void _drawFn;

// @ts-expect-error — GraphicsProps forbids children (children is never)
const _graphicsWithChildren: GraphicsProps = { draw: () => {}, children: document.createElement('div') };
void _graphicsWithChildren;

// x accepts MaybeAccessor<number> | undefined
const _graphicsX: MaybeAccessor<number> | undefined = undefined as GraphicsProps['x'];
void _graphicsX;

// --- ContainerProps ---

// children property exists on ContainerProps
const _containerChildren: ContainerProps['children'] = undefined;
void _containerChildren;

// x accepts MaybeAccessor<number> | undefined
const _containerX: MaybeAccessor<number> | undefined = undefined as ContainerProps['x'];
void _containerX;

// --- SpriteProps ---

// texture is required as MaybeAccessor<string>
const _spriteTexture: MaybeAccessor<string> = '' as SpriteProps['texture'];
void _spriteTexture;

// anchor accepts MaybeAccessor<number> | undefined
const _spriteAnchor: MaybeAccessor<number> | undefined = undefined as SpriteProps['anchor'];
void _spriteAnchor;

// --- TextProps ---

// text is required as MaybeAccessor<string>
const _textProp: MaybeAccessor<string> = '' as TextProps['text'];
void _textProp;

// style property exists on TextProps
const _textStyle: TextProps['style'] = undefined;
void _textStyle;
