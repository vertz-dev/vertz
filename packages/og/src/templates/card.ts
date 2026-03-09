/**
 * Card template — the most common OG image layout.
 *
 * Features a title, optional description, badge, URL, and accent color.
 * Similar to the landing page OG image.
 */

import type { SatoriElement } from '../types';

/** Props for the Card template. */
export interface CardProps {
  /** The main title text. */
  title: string;
  /** Optional description below the title. */
  description?: string;
  /** Optional badge text (e.g., "Public Beta"). */
  badge?: string;
  /** Optional URL displayed in the bottom bar. */
  url?: string;
  /** Accent/brand color for the badge dot. Defaults to '#3b82f6'. */
  brandColor?: string;
  /** Background color. Defaults to '#0a0a0b'. */
  backgroundColor?: string;
}

export function Card({
  title,
  description,
  badge,
  url,
  brandColor = '#3b82f6',
  backgroundColor = '#0a0a0b',
}: CardProps): SatoriElement {
  const children: (SatoriElement | string)[] = [
    // Title
    {
      type: 'div',
      props: {
        style: {
          fontSize: '64px',
          color: '#fafafa',
          lineHeight: 1.1,
          letterSpacing: '-0.025em',
          fontWeight: 700,
        },
        children: title,
      },
    },
  ];

  // Description
  if (description) {
    children.push({
      type: 'div',
      props: {
        style: {
          fontSize: '24px',
          color: '#a1a1aa',
          lineHeight: 1.5,
          marginTop: '24px',
          maxWidth: '700px',
        },
        children: description,
      },
    });
  }

  // Bottom bar with badge and/or URL
  const bottomChildren: SatoriElement[] = [];

  if (badge) {
    bottomChildren.push({
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        },
        children: [
          {
            type: 'div',
            props: {
              style: {
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: brandColor,
              },
            },
          },
          {
            type: 'span',
            props: {
              style: { fontSize: '18px', color: '#71717a' },
              children: badge,
            },
          },
        ],
      },
    });
  }

  if (url) {
    bottomChildren.push({
      type: 'span',
      props: {
        style: { fontSize: '20px', color: '#52525b' },
        children: url,
      },
    });
  }

  if (bottomChildren.length > 0) {
    children.push({
      type: 'div',
      props: {
        style: {
          position: 'absolute',
          bottom: '60px',
          left: '80px',
          right: '80px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        children: bottomChildren,
      },
    });
  }

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '80px',
        backgroundColor,
        position: 'relative',
      },
      children,
    },
  };
}
