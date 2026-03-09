import { Card } from './card';
import { Hero } from './hero';
import { Minimal } from './minimal';

export type { CardProps } from './card';
export type { HeroProps } from './hero';
export type { MinimalProps } from './minimal';

/** Pre-built OG image templates. */
export const OGTemplate = {
  Card,
  Hero,
  Minimal,
} as const;
