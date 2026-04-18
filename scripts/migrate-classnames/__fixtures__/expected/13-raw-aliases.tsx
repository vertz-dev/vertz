import { css, token } from '@vertz/ui';

export const styles = css({
  button: { transition: 'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)', letterSpacing: '0.05em', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', aspectRatio: '16 / 9', top: token.spacing[4], left: token.spacing[2] },
  overlay: { transition: 'box-shadow 150ms cubic-bezier(0.4, 0, 0.2, 1)', letterSpacing: '0.1em' },
  panel: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', aspectRatio: '1 / 1', inset: token.spacing[8] },
});
