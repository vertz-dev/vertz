import { TwitterIcon } from '@vertz/icons';
import { css, Image } from '@vertz/ui';

const s = css({
  section: ['py:24', 'px:6'],
  container: ['max-w:4xl', 'mx:auto'],
  intro: [
    'font:lg',
    'leading:relaxed',
    'max-w:2xl',
    'mx:auto',
    'mb:12',
    'text:center',
    'text:gray.300',
  ],
  grid: [
    'grid',
    'gap:12',
    'max-w:xl',
    'mx:auto',
    { '@media (min-width: 640px)': { 'grid-template-columns': '1fr 1fr' } },
  ],
  card: ['text:center'],
  imgWrap: ['mx:auto', 'mb:4', 'w:20', 'h:20'],
  name: ['weight:semibold', 'font:lg'],
  role: ['font:xs', 'uppercase', 'tracking:wider', 'mt:1', 'text:gray.500'],
  bio: ['font:xs', 'mt:2', 'leading:relaxed', 'max-w:80', 'mx:auto', 'text:gray.400'],
  socialLink: [
    'inline-flex',
    'items:center',
    'gap:1.5',
    'mt:3',
    'font:xs',
    'uppercase',
    'tracking:wider',
    'transition:colors',
    'text:gray.500',
  ],
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
    photo: '/viniciusdacal.jpg',
    bio: '15+ years building at scale. Senior Engineer at Scrunch. Previously Staff Engineer at Voiceflow. Led Angular-to-React migrations, built GraphQL servers, shipped NestJS backends \u2014 and got tired of fighting the frameworks.',
    x: { handle: '@vinicius_dacal', url: 'https://x.com/vinicius_dacal' },
  },
  {
    name: 'Matheus Poleza',
    photo: '/matheuspoleza.jpg',
    bio: '10+ years full-stack. Seed to Series C startups. Microservices, AI integration, performance at scale \u2014 now channeling it all into one stack that does it right.',
    x: { handle: '@matheeuspoleza', url: 'https://x.com/matheeuspoleza' },
  },
];

function FounderPhoto({ name }: { name: string }) {
  if (name === 'Vinicius Dacal') {
    return (
      <div className={s.imgWrap}>
        <Image
          src="/public/viniciusdacal.jpg"
          alt="Vinicius Dacal"
          width={80}
          height={80}
          style="object-fit: cover; border-radius: 9999px; outline: 2px solid #2A2826; outline-offset: 2px"
          fit="cover"
        />
      </div>
    );
  }
  return (
    <div className={s.imgWrap}>
      <Image
        src="/public/matheuspoleza.jpg"
        alt="Matheus Poleza"
        width={80}
        height={80}
        style="object-fit: cover; border-radius: 9999px; outline: 2px solid #2A2826; outline-offset: 2px"
        fit="cover"
      />
    </div>
  );
}

export function Founders() {
  return (
    <section
      id="founders"
      className={s.section}
      style={{ background: '#111110', borderTop: '1px solid #2A2826' }}
    >
      <div className={s.container}>
        <p className={s.intro}>
          We spent years stitching together ORMs, API frameworks, validation libraries, and UI
          toolkits — and watching them drift apart. We built Vertz so the next team doesn't have to.
        </p>

        <div className={s.grid}>
          {FOUNDERS.map((f) => (
            <div key={f.name} className={s.card}>
              <FounderPhoto name={f.name} />
              <p className={s.name}>{f.name}</p>
              <p className={s.role} style={{ fontFamily: 'var(--font-mono)' }}>
                Co-founder
              </p>
              <p className={s.bio}>{f.bio}</p>
              <a
                href={f.x.url}
                target="_blank"
                rel="noopener"
                className={s.socialLink}
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <TwitterIcon size={16} />
                {f.x.handle}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
