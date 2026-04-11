import type { SatoriElement } from '../types';
import { Card } from './card';
import type { CardProps } from './card';
import { Hero } from './hero';
import type { HeroProps } from './hero';
import { Minimal } from './minimal';
import type { MinimalProps } from './minimal';

export type { CardProps } from './card';
export type { HeroProps } from './hero';
export type { MinimalProps } from './minimal';

/** Pre-built OG image templates. */
export const OGTemplate: {
  readonly Card: (props: CardProps) => SatoriElement;
  readonly Hero: (props: HeroProps) => SatoriElement;
  readonly Minimal: (props: MinimalProps) => SatoriElement;
} = {
  Card,
  Hero,
  Minimal,
};
