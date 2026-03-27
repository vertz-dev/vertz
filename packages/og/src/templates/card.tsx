/* @jsxRuntime classic */
/* @jsx h */
/**
 * Card template — the most common OG image layout.
 *
 * Features a title, optional description, badge, URL, and accent color.
 * Similar to the landing page OG image.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- JSX factory used via pragma
import { h } from '../h';
import type { SatoriElement } from '../types';

/** Props for the Card template. */
export interface CardProps {
  /** The main title text. */
  title: string;
  /** Optional description below the title. */
  description?: string;
  /** Optional badge text (e.g., "Canary"). */
  badge?: string;
  /** Optional URL displayed in the bottom bar. */
  url?: string;
  /** Accent/brand color for the badge dot. Defaults to '#f59e0b'. */
  brandColor?: string;
  /** Background color. Defaults to '#0a0a0b'. */
  backgroundColor?: string;
}

export function Card({
  title,
  description,
  badge,
  url,
  brandColor = '#f59e0b',
  backgroundColor = '#0a0a0b',
}: CardProps): SatoriElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '80px',
        backgroundColor,
        position: 'relative',
      }}
    >
      <div
        style={{
          fontSize: '64px',
          color: '#fafafa',
          lineHeight: 1.1,
          letterSpacing: '-0.025em',
          fontWeight: 700,
        }}
      >
        {title}
      </div>

      {description && (
        <div
          style={{
            fontSize: '24px',
            color: '#a1a1aa',
            lineHeight: 1.5,
            marginTop: '24px',
            maxWidth: '700px',
          }}
        >
          {description}
        </div>
      )}

      {(badge || url) && (
        <div
          style={{
            position: 'absolute',
            bottom: '60px',
            left: '80px',
            right: '80px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {badge && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: brandColor,
                }}
              />
              <span style={{ fontSize: '18px', color: '#71717a' }}>{badge}</span>
            </div>
          )}
          {url && <span style={{ fontSize: '20px', color: '#52525b' }}>{url}</span>}
        </div>
      )}
    </div>
  );
}
