import type { CamelCSSPropertyName } from './css-properties';

export type StyleDeclarations = {
  [K in CamelCSSPropertyName]?: string | number;
} & {
  [K in `-${string}` | `Webkit${string}` | `Moz${string}` | `Ms${string}`]?: string | number;
};

export type SelectorKey = `&${string}` | `@${string}`;

export type StyleBlock = StyleDeclarations & {
  [K in SelectorKey]?: StyleBlock;
};
