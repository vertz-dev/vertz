import { css, token } from '@vertz/ui';
import { TOKENS_GLUE_SCHEMA, TOKENS_GLUE_UI } from './highlighted-code';
import { TokenLines } from './token-lines';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  wrapper: { maxWidth: '56rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[12],
    textAlign: 'center',
    color: token.color.gray[500],
  },
  grid: {
    display: 'grid',
    gap: token.spacing[8],
    alignItems: 'flex-start',
    '&': { minWidth: '0' },
    '@media (min-width: 768px)': { gridTemplateColumns: '1fr 1fr' },
  },
  gridItem: { minWidth: '0' },
  columnLabel: {
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.025em',
    marginBottom: token.spacing[4],
  },
  codeBlock: {
    borderWidth: '1px',
    borderRadius: token.radius.lg,
    padding: token.spacing[6],
    fontSize: token.font.size.sm,
    lineHeight: token.font.lineHeight.relaxed,
    backgroundColor: token.color.gray[950],
    '&': { overflowX: 'auto' },
  },
  commentColor: { color: token.color.gray[500] },
  fileColor: { color: token.color.gray[400] },
  descColor: { color: token.color.gray[400] },
  caption: { fontSize: token.font.size.sm, marginTop: token.spacing[4], textAlign: 'center' },
});

const OLD_STACK = [
  { file: 'schema.prisma', desc: 'define the shape' },
  { file: 'server/todos.ts', desc: 'define it again for the API' },
  { file: 'lib/validators.ts', desc: 'define it again for validation' },
  { file: 'hooks/useTodos.ts', desc: 'define it again for fetching' },
  { file: 'components/TodoForm.tsx', desc: 'define it again for the form' },
];

export function GlueCode() {
  return (
    <section className={s.section}>
      <div className={s.wrapper}>
        <div className={s.grid}>
          <div className={s.gridItem}>
            <p
              className={s.columnLabel}
              style={{ fontFamily: 'var(--font-mono)', color: '#a1a1aa' }}
            >
              The typical stack
            </p>
            <div className={s.codeBlock} style={{ borderColor: '#1e1e22' }}>
              {OLD_STACK.map((item) => (
                <div key={item.file} style={{ fontFamily: 'var(--font-mono)', color: '#8b8b94' }}>
                  <span className={s.commentColor}>{'// '}</span>
                  <span className={s.fileColor}>{item.file}</span>
                  <span className={s.descColor}> — {item.desc}</span>
                </div>
              ))}
            </div>
            <p className={s.caption} style={{ fontFamily: 'var(--font-mono)', color: '#8b8b94' }}>
              5 files. Same shape. Pray they stay in sync.
            </p>
          </div>

          <div className={s.gridItem}>
            <p
              className={s.columnLabel}
              style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}
            >
              With Vertz
            </p>
            <div className={s.codeBlock} style={{ borderColor: 'rgba(59,130,246,0.3)' }}>
              <TokenLines lines={TOKENS_GLUE_SCHEMA} />
              <div style={{ marginTop: '1.25rem' }} />
              <TokenLines lines={TOKENS_GLUE_UI} />
            </div>
            <p className={s.caption} style={{ fontFamily: 'var(--font-mono)', color: '#3b82f6' }}>
              1 schema. Everything else is derived.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
