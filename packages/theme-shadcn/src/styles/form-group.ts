import type { CSSOutput } from '@vertz/ui';
import { css, token } from '@vertz/ui';

type FormGroupBlocks = { base: string[]; error: string[] };

/** Create formGroup css() styles. */
export function createFormGroup(): CSSOutput<FormGroupBlocks> {
  const s = css({
    formGroupBase: { display: 'flex', flexDirection: 'column', gap: token.spacing[2] },
    formGroupError: { fontSize: token.font.size.sm, color: token.color.destructive },
  });
  return {
    base: s.formGroupBase,
    error: s.formGroupError,
    css: s.css,
  } as CSSOutput<FormGroupBlocks>;
}
