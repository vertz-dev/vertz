import { injectCSS } from './css';
import { keyframes } from './keyframes';

// Duration/easing constants
export const ANIMATION_DURATION: string = '150ms';
export const ANIMATION_EASING: string = 'cubic-bezier(0.4, 0, 0.2, 1)';

// Fade
export const fadeIn: string = keyframes('vz-fade-in', {
  from: { opacity: '0' },
  to: { opacity: '1' },
});
export const fadeOut: string = keyframes('vz-fade-out', {
  from: { opacity: '1' },
  to: { opacity: '0' },
});

// Zoom (scale 95% <-> 100%, combined with fade)
export const zoomIn: string = keyframes('vz-zoom-in', {
  from: { opacity: '0', transform: 'scale(0.95)' },
  to: { opacity: '1', transform: 'scale(1)' },
});
export const zoomOut: string = keyframes('vz-zoom-out', {
  from: { opacity: '1', transform: 'scale(1)' },
  to: { opacity: '0', transform: 'scale(0.95)' },
});

// Slide (from/to directions, combined with fade)
export const slideInFromTop: string = keyframes('vz-slide-in-from-top', {
  from: { opacity: '0', transform: 'translateY(-0.5rem)' },
  to: { opacity: '1', transform: 'translateY(0)' },
});
export const slideInFromBottom: string = keyframes('vz-slide-in-from-bottom', {
  from: { opacity: '0', transform: 'translateY(0.5rem)' },
  to: { opacity: '1', transform: 'translateY(0)' },
});
export const slideOutToTop: string = keyframes('vz-slide-out-to-top', {
  from: { opacity: '1', transform: 'translateY(0)' },
  to: { opacity: '0', transform: 'translateY(-0.5rem)' },
});
export const slideOutToBottom: string = keyframes('vz-slide-out-to-bottom', {
  from: { opacity: '1', transform: 'translateY(0)' },
  to: { opacity: '0', transform: 'translateY(0.5rem)' },
});

// Accordion height (used with overflow-hidden)
export const accordionDown: string = keyframes('vz-accordion-down', {
  from: { height: '0' },
  to: { height: 'var(--accordion-content-height)' },
});
export const accordionUp: string = keyframes('vz-accordion-up', {
  from: { height: 'var(--accordion-content-height)' },
  to: { height: '0' },
});

// Reduced motion: use near-zero duration (not 'none') so animationend still fires
injectCSS(`
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`);
