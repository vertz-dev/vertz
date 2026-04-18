import { TwitterIcon } from '@vertz/icons';
import { css, token } from '@vertz/ui';

const s = css({
  section: { paddingBlock: token.spacing[24], paddingInline: token.spacing[6] },
  container: { maxWidth: '56rem', marginInline: 'auto' },
  intro: {
    fontSize: token.font.size.lg,
    lineHeight: token.font.lineHeight.relaxed,
    maxWidth: '42rem',
    marginInline: 'auto',
    marginBottom: token.spacing[12],
    textAlign: 'center',
    color: token.color.gray[300],
  },
  grid: {
    display: 'grid',
    gap: token.spacing[12],
    maxWidth: '36rem',
    marginInline: 'auto',
    '@media (min-width: 640px)': { gridTemplateColumns: '1fr 1fr' },
  },
  card: { textAlign: 'center' },
  imgWrap: {
    marginInline: 'auto',
    marginBottom: token.spacing[4],
    width: token.spacing[20],
    height: token.spacing[20],
  },
  name: { fontWeight: token.font.weight.semibold, fontSize: token.font.size.lg },
  role: {
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: token.spacing[1],
    color: token.color.gray[500],
  },
  bio: {
    fontSize: token.font.size.xs,
    marginTop: token.spacing[2],
    lineHeight: token.font.lineHeight.relaxed,
    maxWidth: token.spacing[80],
    marginInline: 'auto',
    color: token.color.gray[400],
  },
  socialLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: token.spacing['1.5'],
    marginTop: token.spacing[3],
    fontSize: token.font.size.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    transition:
      'color 150ms cubic-bezier(0.4, 0, 0.2, 1), background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms cubic-bezier(0.4, 0, 0.2, 1), outline-color 150ms cubic-bezier(0.4, 0, 0.2, 1), text-decoration-color 150ms cubic-bezier(0.4, 0, 0.2, 1), fill 150ms cubic-bezier(0.4, 0, 0.2, 1), stroke 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    color: token.color.gray[500],
  },
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

const photoStyle = {
  width: '80px',
  height: '80px',
  objectFit: 'cover' as const,
  borderRadius: '9999px',
  outline: '2px solid #2A2826',
  outlineOffset: '2px',
};

function FounderPhoto({ photo, name }: { photo: string; name: string }) {
  return (
    <div className={s.imgWrap}>
      <img src={photo} alt={name} width={80} height={80} style={photoStyle} />
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
              <FounderPhoto photo={f.photo} name={f.name} />
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
