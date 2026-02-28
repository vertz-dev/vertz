import type { CSSOutput } from '@vertz/ui';
import { css } from '@vertz/ui';

type FormGroupBlocks = { base: string[]; error: string[] };

/** Create formGroup css() styles. */
export function createFormGroup(): CSSOutput<FormGroupBlocks> {
  const s = css({
    formGroupBase: ['flex', 'flex-col', 'gap:2'],
    formGroupError: ['text:sm', 'text:destructive'],
  });
  return {
    base: s.formGroupBase,
    error: s.formGroupError,
    css: s.css,
  } as CSSOutput<FormGroupBlocks>;
}
