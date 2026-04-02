import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: [
    'max-w:4xl',
    'mx:auto',
    'grid',
    'gap:12',
    'items:center',
    { '@media (min-width: 768px)': { 'grid-template-columns': '1fr 1fr' } },
  ],
  heading: ['font:4xl', 'mb:6'],
  desc: ['font:lg', 'mb:4'],
  links: ['flex', 'flex-col', 'gap:2', 'mt:6'],
  link: [
    'font:xs',
    'uppercase',
    'tracking:wider',
    'transition:colors',
    { '&:hover': { color: '#E8E4DC' } },
  ],
  terminal: [
    'p:6',
    'font:sm',
    'border:1',
    { '&': { 'overflow-x': 'auto', 'border-radius': '2px' } },
  ],
  terminalLine: ['mb:2'],
  successLine: ['mt:4'],
});

export function OpenAPIGetStarted() {
  return (
    <section
      className={s.section}
      style={{
        background: '#0F0F0E',
        borderTop: '1px solid #2A2826',
        borderBottom: '1px solid #2A2826',
      }}
    >
      <div className={s.container}>
        <div>
          <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
            Get started in one command.
          </h2>
          <p className={s.desc} style={{ color: '#9C9690' }}>
            Point at your OpenAPI spec. Get a typed SDK. No install required — npx runs it directly.
          </p>
          <div className={s.links}>
            <a
              href="https://www.npmjs.com/package/@vertz/openapi"
              target="_blank"
              rel="noopener"
              className={s.link}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              npm &rarr;
            </a>
            <a
              href="https://github.com/vertz-dev/vertz/tree/main/packages/openapi"
              target="_blank"
              rel="noopener"
              className={s.link}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              GitHub &rarr;
            </a>
            <a
              href="https://docs.vertz.dev"
              className={s.link}
              style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}
            >
              Docs &rarr;
            </a>
          </div>
        </div>
        <div
          className={s.terminal}
          style={{ background: '#1C1B1A', borderColor: '#2A2826', fontFamily: 'var(--font-mono)' }}
        >
          <div className={s.terminalLine} style={{ color: '#6B6560' }}>
            $ npx @vertz/openapi generate --from ./openapi.json
          </div>
          <div className={s.successLine} style={{ color: '#C8451B' }}>
            ✓ 12 files written to ./src/generated
          </div>
          <div style={{ color: '#C8451B' }}>✓ 47 TypeScript types generated</div>
          <div style={{ color: '#C8451B' }}>✓ Full type coverage</div>
        </div>
      </div>
    </section>
  );
}
