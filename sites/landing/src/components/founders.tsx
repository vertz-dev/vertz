import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:4xl', 'mx:auto'],
  intro: ['font:lg', 'leading:relaxed', 'max-w:2xl', 'mx:auto', 'mb:12', 'text:center'],
  grid: ['grid', 'grid-cols:2', 'gap:12', 'max-w:xl', 'mx:auto'],
  card: ['text:center'],
  img: ['w:20', 'h:20', 'mx:auto', 'mb:4', 'rounded:full'],
  name: ['weight:semibold', 'font:lg'],
  role: ['font:xs', 'uppercase', 'tracking:wider', 'mt:1'],
  bio: ['font:xs', 'mt:2', 'leading:relaxed', 'max-w:80', 'mx:auto'],
  socialLink: [
    'inline-flex',
    'items:center',
    'gap:1.5',
    'mt:3',
    'font:xs',
    'uppercase',
    'tracking:wider',
    'transition:colors',
  ],
  icon: ['w:4', 'h:4'],
});

interface Founder {
  name: string;
  photo: string;
  bio: string;
  x: { handle: string; url: string };
}

const FOUNDERS: Founder[] = [
  {
    name: 'Vinicius Dacal',
    photo: '/public/viniciusdacal.jpg',
    bio: '15+ years building at scale. Senior Engineer at Scrunch. Previously Staff Engineer at Voiceflow. Led Angular-to-React migrations, built GraphQL servers, shipped NestJS backends \u2014 and got tired of fighting the frameworks.',
    x: { handle: '@vinicius_dacal', url: 'https://x.com/vinicius_dacal' },
  },
  {
    name: 'Matheus Poleza',
    photo: '/public/matheuspoleza.jpg',
    bio: '10+ years full-stack. Seed to Series C startups. Microservices, AI integration, performance at scale \u2014 now channeling it all into one stack that does it right.',
    x: { handle: '@matheeuspoleza', url: 'https://x.com/matheeuspoleza' },
  },
];

export function Founders() {
  return (
    <section
      id="founders"
      class={s.section}
      style="background: #0e0e11; border-top: 1px solid rgba(255,255,255,0.02)"
    >
      <div class={s.container}>
        <p class={s.intro} style="color: #d4d4d8">
          We spent years stitching together ORMs, API frameworks, validation libraries, and UI
          toolkits — and watching them drift apart. We built Vertz so the next team doesn't have to.
        </p>

        <div class={s.grid}>
          {FOUNDERS.map((f) => (
            <div key={f.name} class={s.card}>
              <img
                src={f.photo}
                alt={f.name}
                class={s.img}
                style="object-fit: cover; outline: 2px solid #27272a; outline-offset: 2px"
              />
              <p class={s.name}>{f.name}</p>
              <p class={s.role} style="font-family: 'JetBrains Mono', monospace; color: #71717a">
                Co-founder
              </p>
              <p class={s.bio} style="color: #a1a1aa">
                {f.bio}
              </p>
              <a
                href={f.x.url}
                target="_blank"
                rel="noopener"
                class={s.socialLink}
                style="font-family: 'JetBrains Mono', monospace; color: #71717a"
              >
                <XIcon />
                {f.x.handle}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function XIcon() {
  return (
    <svg class={s.icon} fill="currentColor" viewBox="0 0 24 24" aria-label="X">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
