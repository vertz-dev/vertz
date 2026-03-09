import { css } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  grid: ['grid', 'gap:12'],
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
      <div style="max-width: 56rem; margin: 0 auto">
        <p style="color: #d4d4d8; font-size: 1.125rem; line-height: 1.625; max-width: 42rem; margin: 0 auto 3rem; text-align: center">
          We spent years stitching together ORMs, API frameworks, validation libraries, and UI toolkits — and watching them drift apart. We built Vertz so the next team doesn't have to.
        </p>

        <div class={s.grid} style="grid-template-columns: repeat(2, 1fr); max-width: 36rem; margin: 0 auto">
          {FOUNDERS.map((f) => (
            <div key={f.name} style="text-align: center">
              <img
                src={f.photo}
                alt={f.name}
                style="width: 5rem; height: 5rem; margin: 0 auto 1rem; object-fit: cover; outline: 2px solid #27272a; outline-offset: 2px"
              />
              <p style="font-weight: 600; font-size: 1.125rem">{f.name}</p>
              <p style="font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; margin-top: 0.25rem">
                Co-founder
              </p>
              <p style="font-size: 0.75rem; color: #a1a1aa; margin-top: 0.5rem; line-height: 1.625; max-width: 20rem; margin-left: auto; margin-right: auto">
                {f.bio}
              </p>
              <a
                href={f.x.url}
                target="_blank"
                rel="noopener"
                style="display: inline-flex; align-items: center; gap: 0.375rem; margin-top: 0.75rem; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; transition: color 0.15s"
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
    <svg style="width: 1rem; height: 1rem" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
