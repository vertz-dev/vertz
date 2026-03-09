/**
 * Minimal template — clean, text-focused OG image.
 *
 * Large title with a subtle accent border. No decoration.
 */

import type { SatoriElement } from '../types';

/** Props for the Minimal template. */
export interface MinimalProps {
  /** The title text. */
  title: string;
  /** Accent color for the left border. Defaults to '#3b82f6'. */
  accent?: string;
}

export function Minimal({ title, accent = '#3b82f6' }: MinimalProps): SatoriElement {
  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '80px',
        backgroundColor: '#0a0a0b',
      },
      children: {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            borderLeft: `6px solid ${accent}`,
            paddingLeft: '40px',
          },
          children: {
            type: 'div',
            props: {
              style: {
                fontSize: '72px',
                color: '#fafafa',
                lineHeight: 1.2,
                letterSpacing: '-0.025em',
                fontWeight: 700,
                maxWidth: '900px',
              },
              children: title,
            },
          },
        },
      },
    },
  };
}
