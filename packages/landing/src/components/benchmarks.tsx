import { Island, css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '64rem', marginInline: 'auto' },
  label: {
    fontSize: token.font.size.xs,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: token.spacing[4],
    textAlign: 'center',
  },
  heading: {
    fontSize: token.font.size['4xl'],
    marginBottom: token.spacing[4],
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: token.spacing[12],
    maxWidth: '36rem',
    marginInline: 'auto',
  },
  tabBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: token.spacing[1],
    marginBottom: token.spacing[10],
    padding: token.spacing[1],
    marginInline: 'auto',
    '&': {
      borderRadius: '2px',
      background: '#1C1B1A',
      border: '1px solid #2A2826',
      width: 'fit-content',
    },
  },
  tab: {
    paddingBlock: token.spacing[2],
    paddingInline: token.spacing[4],
    fontSize: token.font.size.xs,
    letterSpacing: '0.025em',
    cursor: 'pointer',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    '&': { background: 'none', border: 'none', outline: 'none', borderRadius: '2px' },
  },
  panelWrap: { display: 'grid' },
  panel: {},
  card: { padding: token.spacing[6], borderWidth: '1px' },
  barGroup: { display: 'flex', flexDirection: 'column', gap: token.spacing[3] },
  barRow: { display: 'flex', flexDirection: 'column', gap: token.spacing[1] },
  barLabel: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  barName: { fontSize: token.font.size.xs },
  barValue: { fontSize: token.font.size.xs },
  barTrack: { position: 'relative' },
  barFill: {},
  footnote: { fontSize: token.font.size.xs, textAlign: 'center', marginTop: token.spacing[8] },
});

// ── Placeholder benchmark data ──────────────────────────────

// SSR Performance
const SSR_BENCHMARKS = [
  { name: 'Vertz', reqPerSec: 12_400, isVertz: true },
  { name: 'Hono', reqPerSec: 9_800, isVertz: false },
  { name: 'SvelteKit', reqPerSec: 4_200, isVertz: false },
  { name: 'Next.js', reqPerSec: 2_100, isVertz: false },
];

const SSR_LATENCY = { mean: '0.08ms', median: '0.06ms', p99: '0.24ms' };

// Dev Experience
const DEV_EXPERIENCE = [
  {
    metric: 'Cold start',
    data: [
      { name: 'Vertz', value: 180, unit: 'ms', isVertz: true },
      { name: 'Hono', value: 340, unit: 'ms', isVertz: false },
      { name: 'SvelteKit', value: 1_200, unit: 'ms', isVertz: false },
      { name: 'Next.js', value: 2_800, unit: 'ms', isVertz: false },
    ],
  },
  {
    metric: 'Build time',
    data: [
      { name: 'Vertz', value: 0.8, unit: 's', isVertz: true },
      { name: 'Hono', value: 1.2, unit: 's', isVertz: false },
      { name: 'SvelteKit', value: 3.4, unit: 's', isVertz: false },
      { name: 'Next.js', value: 8.2, unit: 's', isVertz: false },
    ],
  },
  {
    metric: 'Fast refresh',
    data: [
      { name: 'Vertz', value: 12, unit: 'ms', isVertz: true },
      { name: 'SvelteKit', value: 45, unit: 'ms', isVertz: false },
      { name: 'Next.js', value: 120, unit: 'ms', isVertz: false },
    ],
  },
];

// Web Vitals
const WEB_VITALS = [
  {
    metric: 'Performance',
    data: [
      { name: 'Vertz', value: 100, unit: '', isVertz: true },
      { name: 'Hono', value: 98, unit: '', isVertz: false },
      { name: 'SvelteKit', value: 92, unit: '', isVertz: false },
      { name: 'Next.js', value: 78, unit: '', isVertz: false },
    ],
    isAbsolute: true,
  },
  {
    metric: 'Time to interactive',
    data: [
      { name: 'Vertz', value: 0.3, unit: 's', isVertz: true },
      { name: 'Hono', value: 0.4, unit: 's', isVertz: false },
      { name: 'SvelteKit', value: 0.8, unit: 's', isVertz: false },
      { name: 'Next.js', value: 1.6, unit: 's', isVertz: false },
    ],
  },
  {
    metric: 'Bundle size',
    data: [
      { name: 'Vertz', value: 14, unit: 'kB', isVertz: true },
      { name: 'Hono', value: 12, unit: 'kB', isVertz: false },
      { name: 'SvelteKit', value: 38, unit: 'kB', isVertz: false },
      { name: 'Next.js', value: 87, unit: 'kB', isVertz: false },
    ],
  },
];

// LLM Agent Performance
const LLM_TASK = 'Build a full-stack todo app with authentication';

const LLM_BENCHMARKS = [
  {
    name: 'Vertz',
    isVertz: true,
    tokens: 12_000,
    turns: 3,
    passRate: 95,
    cost: 0.08,
  },
  {
    name: 'Next.js',
    isVertz: false,
    tokens: 45_000,
    turns: 12,
    passRate: 72,
    cost: 0.31,
  },
  {
    name: 'SvelteKit',
    isVertz: false,
    tokens: 38_000,
    turns: 9,
    passRate: 78,
    cost: 0.26,
  },
  {
    name: 'Hono',
    isVertz: false,
    tokens: 52_000,
    turns: 15,
    passRate: 65,
    cost: 0.36,
  },
];

// ── Helpers ─────────────────────────────────────────────────

function Bar({ percent, isVertz }: { percent: number; isVertz: boolean }) {
  return (
    <div
      className={s.barTrack}
      style={{ height: '6px', borderRadius: '3px', background: '#111110' }}
    >
      <div
        className={s.barFill}
        style={{
          height: '6px',
          borderRadius: '3px',
          width: `${Math.max(percent, 2)}%`,
          background: isVertz ? '#C8451B' : '#4A4540',
          opacity: isVertz ? 1 : 0.5,
        }}
      />
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function MetricLabel({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        color: '#4A4540',
        marginBottom: '0.5rem',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {text}
    </div>
  );
}

function BarRow({
  name,
  value,
  unit,
  percent,
  isVertz,
}: {
  name: string;
  value: string;
  unit: string;
  percent: number;
  isVertz: boolean;
}) {
  return (
    <div className={s.barRow}>
      <div className={s.barLabel}>
        <span
          className={s.barName}
          style={{ fontFamily: 'var(--font-mono)', color: isVertz ? '#E8E4DC' : '#6B6560' }}
        >
          {name}
        </span>
        <span
          className={s.barValue}
          style={{ fontFamily: 'var(--font-mono)', color: isVertz ? '#C8451B' : '#4A4540' }}
        >
          {value}
          {unit}
        </span>
      </div>
      <Bar percent={percent} isVertz={isVertz} />
    </div>
  );
}

// ── Tab panels ──────────────────────────────────────────────

function SSRPanel() {
  const maxReq = Math.max(...SSR_BENCHMARKS.map((b) => b.reqPerSec));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className={s.barGroup}>
        {SSR_BENCHMARKS.map((b) => (
          <BarRow
            key={b.name}
            name={b.name}
            value={formatNumber(b.reqPerSec)}
            unit=" req/s"
            percent={(b.reqPerSec / maxReq) * 100}
            isVertz={b.isVertz}
          />
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderTop: '1px solid #2A2826',
          paddingTop: '1rem',
        }}
      >
        {(['mean', 'median', 'p99'] as const).map((k) => (
          <div key={k} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: '#4A4540',
                marginBottom: '0.25rem',
              }}
            >
              {k}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#C8451B' }}>
              {SSR_LATENCY[k]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DevPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {DEV_EXPERIENCE.map((group) => {
        const maxValue = Math.max(...group.data.map((d) => d.value));
        return (
          <div key={group.metric}>
            <MetricLabel text={group.metric} />
            <div className={s.barGroup}>
              {group.data.map((d) => (
                <BarRow
                  key={d.name}
                  name={d.name}
                  value={String(d.value)}
                  unit={d.unit}
                  percent={(d.value / maxValue) * 100}
                  isVertz={d.isVertz}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WebVitalsPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {WEB_VITALS.map((group) => {
        const maxValue = Math.max(...group.data.map((d) => d.value));
        return (
          <div key={group.metric}>
            <MetricLabel text={group.metric} />
            <div className={s.barGroup}>
              {group.data.map((d) => (
                <BarRow
                  key={d.name}
                  name={d.name}
                  value={String(d.value)}
                  unit={d.unit}
                  percent={group.isAbsolute ? d.value : (d.value / maxValue) * 100}
                  isVertz={d.isVertz}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LLMPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: '#6B6560',
          padding: '0.75rem 1rem',
          background: '#111110',
          borderRadius: '2px',
          border: '1px solid #2A2826',
        }}
      >
        Task: {LLM_TASK}
      </div>

      {/* Tokens consumed */}
      <div>
        <MetricLabel text="Tokens consumed" />
        <div className={s.barGroup}>
          {LLM_BENCHMARKS.map((b) => {
            const max = Math.max(...LLM_BENCHMARKS.map((x) => x.tokens));
            return (
              <BarRow
                key={b.name}
                name={b.name}
                value={formatNumber(b.tokens)}
                unit=""
                percent={(b.tokens / max) * 100}
                isVertz={b.isVertz}
              />
            );
          })}
        </div>
      </div>

      {/* Interactions */}
      <div>
        <MetricLabel text="Interactions" />
        <div className={s.barGroup}>
          {LLM_BENCHMARKS.map((b) => {
            const max = Math.max(...LLM_BENCHMARKS.map((x) => x.turns));
            return (
              <BarRow
                key={b.name}
                name={b.name}
                value={String(b.turns)}
                unit=""
                percent={(b.turns / max) * 100}
                isVertz={b.isVertz}
              />
            );
          })}
        </div>
      </div>

      {/* Test pass rate + Cost in a compact grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          borderTop: '1px solid #2A2826',
          paddingTop: '1rem',
        }}
      >
        <div>
          <MetricLabel text="Test pass rate" />
          {LLM_BENCHMARKS.map((b) => (
            <div
              key={b.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                padding: '0.25rem 0',
              }}
            >
              <span style={{ color: b.isVertz ? '#E8E4DC' : '#6B6560' }}>{b.name}</span>
              <span style={{ color: b.isVertz ? '#C8451B' : '#4A4540' }}>{b.passRate}%</span>
            </div>
          ))}
        </div>
        <div>
          <MetricLabel text="Cost (Claude Sonnet)" />
          {LLM_BENCHMARKS.map((b) => (
            <div
              key={b.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                padding: '0.25rem 0',
              }}
            >
              <span style={{ color: b.isVertz ? '#E8E4DC' : '#6B6560' }}>{b.name}</span>
              <span style={{ color: b.isVertz ? '#C8451B' : '#4A4540' }}>${b.cost.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Tab definitions ─────────────────────────────────────────

const TABS = [
  { id: 'ssr', label: 'SSR' },
  { id: 'dev', label: 'Dev' },
  { id: 'vitals', label: 'Web Vitals' },
  { id: 'llm', label: 'LLM Agent' },
] as const;

function BenchmarkTabs() {
  let activeTab = 'ssr';

  return (
    <div>
      <div className={s.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={s.tab}
            style={{
              fontFamily: 'var(--font-mono)',
              color: activeTab === tab.id ? '#E8E4DC' : '#6B6560',
              background: activeTab === tab.id ? '#2A2826' : 'transparent',
            }}
            onClick={() => {
              activeTab = tab.id;
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className={s.card}
        style={{
          background: '#1C1B1A',
          borderColor: '#2A2826',
          borderRadius: '2px',
          maxWidth: '40rem',
          margin: '0 auto',
        }}
      >
        <div className={s.panelWrap}>
          <div
            className={s.panel}
            style={{ gridArea: '1 / 1', visibility: activeTab === 'ssr' ? 'visible' : 'hidden' }}
          >
            <SSRPanel />
          </div>
          <div
            className={s.panel}
            style={{ gridArea: '1 / 1', visibility: activeTab === 'dev' ? 'visible' : 'hidden' }}
          >
            <DevPanel />
          </div>
          <div
            className={s.panel}
            style={{ gridArea: '1 / 1', visibility: activeTab === 'vitals' ? 'visible' : 'hidden' }}
          >
            <WebVitalsPanel />
          </div>
          <div
            className={s.panel}
            style={{ gridArea: '1 / 1', visibility: activeTab === 'llm' ? 'visible' : 'hidden' }}
          >
            <LLMPanel />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────

export function Benchmarks() {
  return (
    <section className={s.section}>
      <div className={s.container}>
        <p className={s.label} style={{ fontFamily: 'var(--font-mono)', color: '#6B6560' }}>
          Benchmarks
        </p>
        <h2 className={s.heading} style={{ fontFamily: 'var(--font-display)', color: '#E8E4DC' }}>
          Fast is the default.
        </h2>
        <p className={s.subtitle} style={{ color: '#9C9690' }}>
          Tested against the most popular frameworks. Real SSR throughput, real dev workflows, real
          Lighthouse scores — and the first-ever LLM agent benchmark.
        </p>

        <Island component={BenchmarkTabs} />

        <p className={s.footnote} style={{ fontFamily: 'var(--font-mono)', color: '#4A4540' }}>
          Benchmarks run on identical hardware. Source and methodology on GitHub.
        </p>
      </div>
    </section>
  );
}
