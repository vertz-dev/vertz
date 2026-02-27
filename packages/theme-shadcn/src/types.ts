/** Color token values: a map of color names to contextual/shade values. */
export type PaletteTokens = Record<string, Record<string, string>>;

/** Deep partial type for token overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K];
};
