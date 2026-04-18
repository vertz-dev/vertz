import type { CSSOutput, StyleEntry } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type SliderBlocks = {
  root: StyleEntry[];
  track: StyleEntry[];
  range: StyleEntry[];
  thumb: StyleEntry[];
};

const ringStyle = {
  boxShadow: '0 0 0 3px color-mix(in oklch, var(--color-ring) 50%, transparent)',
};

/** Create slider css() styles following shadcn conventions. */
export function createSliderStyles(): CSSOutput<SliderBlocks> {
  const s = css({
    sliderRoot: {
      position: 'relative',
      display: 'flex',
      width: '100%',
      alignItems: 'center',
      '&': { touchAction: 'none', userSelect: 'none', height: '20px', cursor: 'pointer' },
    },
    sliderTrack: {
      position: 'relative',
      width: '100%',
      borderRadius: token.radius.full,
      backgroundColor: token.color.muted,
      '&': { height: '0.25rem', overflow: 'visible' },
    },
    sliderRange: { backgroundColor: token.color.primary },
    sliderThumb: {
      display: 'block',
      height: token.spacing[3],
      width: token.spacing[3],
      borderRadius: token.radius.full,
      borderWidth: '1px',
      borderColor: token.color.ring,
      cursor: 'pointer',
      '&': { background: 'white', transition: 'color 150ms, box-shadow 150ms', top: '50%' },
      '&::after': { content: '""', position: 'absolute', inset: '-0.5rem' },
      '&:hover': { outline: 'none', ...ringStyle },
      '&:focus-visible': { outline: 'none', ...ringStyle },
      '&:active': ringStyle,
      '&:disabled': { pointerEvents: 'none', opacity: '0.5' },
    },
  });
  return {
    root: s.sliderRoot,
    track: s.sliderTrack,
    range: s.sliderRange,
    thumb: s.sliderThumb,
    css: s.css,
  } as CSSOutput<SliderBlocks>;
}
