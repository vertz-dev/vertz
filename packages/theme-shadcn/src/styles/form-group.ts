import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type FormGroupBlocks = { base: string[]; error: string[] };

/** Create formGroup css() styles. */
export function createFormGroup(): CSSOutput<FormGroupBlocks> {
  return css({
    base: ['flex', 'flex-col', 'gap:1.5'],
    error: ['text:xs', 'text:destructive'],
  });
}
