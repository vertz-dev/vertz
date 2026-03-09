/**
 * Lightweight JSX factory for Satori-compatible element trees.
 *
 * Configured via tsconfig `"jsxFactory": "h"`. Produces { type, props }
 * objects that Satori accepts directly — no React dependency needed.
 */

import type { SatoriChild, SatoriElement } from './types';

/**
 * Create a Satori element. Used as the JSX factory for OG templates.
 *
 * Falsy children (null, undefined, false) are filtered out so that
 * conditional rendering (`{x && <div/>}`) works naturally.
 */
export function h(
  type: string,
  props: Record<string, unknown> | null,
  ...children: SatoriChild[]
): SatoriElement {
  const { children: _propsChildren, ...restProps } = props ?? {};

  const filtered = children.filter(
    (c): c is Exclude<SatoriChild, null | undefined | false> =>
      c !== null && c !== undefined && c !== false,
  );

  const resolvedChildren: SatoriChild | SatoriChild[] | undefined =
    filtered.length > 1 ? filtered : filtered.length === 1 ? filtered[0] : undefined;

  return {
    type,
    props: {
      ...restProps,
      ...(resolvedChildren !== undefined ? { children: resolvedChildren } : {}),
    },
  };
}
