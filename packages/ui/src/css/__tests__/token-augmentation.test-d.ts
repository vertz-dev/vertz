/**
 * Type-level verification of `declare module '@vertz/ui'` augmentation.
 *
 * When a project augments `VertzThemeColors` (or spacing/fonts), the
 * conditional in `VertzThemeTokens` flips from `TokenPath` fallback to the
 * concrete theme shape. Unknown keys then fail typecheck.
 */

declare module '../token' {
  interface VertzThemeColors {
    background: string;
    foreground: string;
    primary: {
      500: string;
      700: string;
    };
  }
}

import { token } from '../token';

// ─── Augmented path: known keys are strings ──────────────────────

const bg: string = token.color.background;
const fg: string = token.color.foreground;
const p500: string = token.color.primary[500];
const p700: string = token.color.primary[700];

void bg;
void fg;
void p500;
void p700;

// ─── Unknown keys are now compile errors ─────────────────────────

// @ts-expect-error — 'nonexistent' is not a key of the augmented color type
const missing: string = token.color.nonexistent;
void missing;

// @ts-expect-error — shade 999 is not a key of primary
const missingShade: string = token.color.primary[999];
void missingShade;
