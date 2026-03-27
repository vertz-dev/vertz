import { css, Island } from '@vertz/ui';
import CopyButton from './copy-button';
import { TOKENS_ENTITY, TOKENS_SCHEMA, TOKENS_UI } from './highlighted-code';
import { TokenLines } from './token-lines';

const TABS = [
  { id: 'ui', label: 'UI', filename: 'TodoList.tsx', tokens: TOKENS_UI },
  { id: 'api', label: 'API', filename: 'todos.entity.ts', tokens: TOKENS_ENTITY },
  { id: 'schema', label: 'Schema', filename: 'schema.ts', tokens: TOKENS_SCHEMA },
] as const;

const s = css({
  section: [
    'flex',
    'items:center',
    'justify:center',
    'px:6',
    'min-h:screen',
    {
      '@media (min-width: 1024px)': {
        'padding-left': '3rem',
        'padding-right': '3rem',
      },
    },
  ],
  grid: [
    'flex',
    'flex-col',
    'gap:12',
    'w:full',
    'max-w:6xl',
    'mx:auto',
    'items:center',
    {
      '@media (min-width: 1024px)': {
        'flex-direction': 'row',
        'align-items': 'center',
        gap: '4rem',
      },
    },
  ],
  textCol: [
    'flex',
    'flex-col',
    'text:center',
    {
      '@media (min-width: 1024px)': {
        'text-align': 'left',
        flex: '1 1 0%',
        'min-width': '0',
      },
    },
  ],
  codeCol: [
    'w:full',
    {
      '@media (min-width: 1024px)': {
        flex: '1 1 0%',
        'min-width': '0',
      },
    },
  ],
  badge: ['flex', 'items:center', 'gap:2', 'mb:6', { '@media (min-width: 1024px)': { 'justify-content': 'flex-start' } }],
  badgeDotWrap: ['relative', 'flex', 'h:2.5', 'w:2.5'],
  badgeDotPing: ['absolute', 'inline-flex', 'h:full', 'w:full', 'rounded:full', 'opacity:40'],
  badgeDot: ['relative', 'inline-flex', 'rounded:full', 'h:2.5', 'w:2.5'],
  badgeText: ['font:xs', 'tracking:widest', 'uppercase', { '&': { color: '#6B6560' } }],
  h1: [],
  h1Line: ['block'],
  h1LineFaded: ['block', { '&': { color: '#6B6560' } }],
  description: ['mt:6', 'font:base', 'max-w:xl', 'leading:relaxed', { '&': { color: '#6B6560' } }],
  descriptionHighlight: ['weight:medium', { '&': { color: '#E8E4DC' } }],
  ctas: [
    'mt:10',
    'flex',
    'flex-col',
    'items:stretch',
    'gap:4',
    {
      '@media (min-width: 1024px)': {
        'align-items': 'flex-start',
      },
    },
  ],
  githubLink: [
    'flex',
    'items:center',
    'justify:center',
    'gap:2',
    'py:3',
    'px:6',
    'font:sm',
    'uppercase',
    'tracking:wider',
    'transition:colors',
    { '&': { color: '#6B6560' } },
    {
      '@media (min-width: 640px)': { display: 'inline-flex' },
    },
  ],
  // Code group styles
  codeGroup: [
    'border:1',
    'shadow:2xl',
    { '&': { overflow: 'hidden', 'background-color': '#1C1B1A', 'border-color': '#2A2826', 'border-radius': '2px' } },
  ],
  tabBar: [
    'flex',
    'border-b:1',
    { '&': { 'border-color': '#2A2826' } },
  ],
  tab: [
    'py:2.5',
    'px:4',
    'font:xs',
    'tracking:wide',
    'cursor:pointer',
    'transition:colors',
    'border-b:2',
    {
      '&': {
        background: 'none',
        border: 'none',
        'border-bottom': '2px solid transparent',
        outline: 'none',
      },
    },
  ],
  codeBody: [
    'p:5',
    'font:xs',
    'leading:relaxed',
    { '&': { color: '#D4D0C8' } },
    { '&': { 'overflow-x': 'auto' } },
  ],
  filename: [
    'font:xs',
    'text:gray.500',
    'px:6',
    'pt:4',
    'pb:0',
  ],
});

function HeroCodeGroup() {
  let activeTab = 'ui';

  return (
    <div className={s.codeGroup} style={{ borderColor: '#2A2826' }}>
      <div className={s.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={s.tab}
            style={{
              fontFamily: 'var(--font-mono)',
              color: activeTab === tab.id ? '#C8451B' : '#6B6560',
              borderBottomColor: activeTab === tab.id ? '#C8451B' : 'transparent',
            }}
            onClick={() => { activeTab = tab.id; }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid' }}>
        {TABS.map((tab) => (
          <div
            key={tab.id}
            className={s.codeBody}
            style={{
              gridArea: '1 / 1',
              visibility: activeTab === tab.id ? 'visible' : 'hidden',
            }}
          >
            <TokenLines lines={tab.tokens} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className={s.section}>
      <div className={s.grid}>
        <div className={s.textCol}>
          <div className={s.badge} style={{ justifyContent: 'center' }}>
            <span className={s.badgeDotWrap}>
              <span className={s.badgeDotPing} style={{ background: '#fbbf24' }} />
              <span className={s.badgeDot} style={{ background: '#f59e0b' }} />
            </span>
            <span className={s.badgeText} style={{ fontFamily: 'var(--font-mono)' }}>
              Canary
            </span>
          </div>

          <h1
            className={s.h1}
            style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', letterSpacing: '-0.025em', lineHeight: '1.15' }}
          >
            <span className={s.h1Line}>The agent-native</span>
            <span className={s.h1LineFaded}>full-stack framework.</span>
          </h1>

          <p className={s.description}>
            One schema derives your database, API, and UI.{' '}
            <span className={s.descriptionHighlight}>
              Fully typed end-to-end. Built for agents to write, humans to ship.
            </span>
          </p>

          <div className={s.ctas}>
            <Island component={CopyButton} />
            <a
              href="https://github.com/vertz-dev/vertz"
              target="_blank"
              rel="noopener"
              className={s.githubLink}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              View on GitHub →
            </a>
          </div>
        </div>

        <div className={s.codeCol}>
          <Island component={HeroCodeGroup} />
        </div>
      </div>
    </section>
  );
}
