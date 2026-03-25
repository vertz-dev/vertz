/* @jsxRuntime classic */
/* @jsx h */
/**
 * Hero template — full-bleed, center-aligned OG image.
 *
 * Large title with optional subtitle and gradient background.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- JSX factory used via pragma
import { h } from '../h';
import type { SatoriElement } from '../types';

/** Props for the Hero template. */
export interface HeroProps {
  /** The main title text (displayed large and centered). */
  title: string;
  /** Optional subtitle below the title. */
  subtitle?: string;
  /** Gradient start color. Defaults to '#0a0a0b'. */
  gradientFrom?: string;
  /** Gradient end color. Defaults to '#1a1a2e'. */
  gradientTo?: string;
}

export function Hero({ title, subtitle, gradientFrom, gradientTo }: HeroProps): SatoriElement {
  const hasGradient = gradientFrom != null || gradientTo != null;
  const gFrom = gradientFrom ?? '#0a0a0b';
  const gTo = gradientTo ?? '#1a1a2e';

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '80px',
        ...(hasGradient
          ? { background: `linear-gradient(135deg, ${gFrom}, ${gTo})` }
          : { backgroundColor: '#0a0a0b' }),
      }}
    >
      <div
        style={{
          fontSize: '80px',
          color: '#fafafa',
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          fontWeight: 700,
          textAlign: 'center',
          maxWidth: '900px',
        }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          style={{
            fontSize: '28px',
            color: '#a1a1aa',
            lineHeight: 1.5,
            marginTop: '24px',
            textAlign: 'center',
            maxWidth: '700px',
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
