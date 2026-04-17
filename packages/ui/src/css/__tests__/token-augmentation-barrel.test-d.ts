/**
 * Type-level verification that `declare module '@vertz/ui'` — the documented
 * user-facing augmentation path — actually narrows the `token.*` namespace.
 *
 * This complements `token-augmentation.test-d.ts` which augments the defining
 * module directly (`../token`). Together they prove both the internal mechanism
 * and the shipped public contract.
 */

declare module '@vertz/ui' {
  interface VertzThemeSpacing {
    1: string;
    4: string;
    8: string;
  }
  interface VertzThemeFonts {
    sans: string;
    mono: string;
  }
}

import { token } from '@vertz/ui';

// ─── Augmented spacing: known numeric keys are strings ───────────

const s1: string = token.spacing[1];
const s4: string = token.spacing[4];
const s8: string = token.spacing[8];

void s1;
void s4;
void s8;

// ─── Augmented fonts: known keys are strings ─────────────────────

const sans: string = token.font.sans;
const mono: string = token.font.mono;

void sans;
void mono;

// ─── Unknown keys are compile errors ─────────────────────────────

// @ts-expect-error — spacing key 999 not declared in augmentation
const missingSpacing: string = token.spacing[999];
void missingSpacing;

// @ts-expect-error — font 'serif' not declared in augmentation
const missingFont: string = token.font.serif;
void missingFont;
