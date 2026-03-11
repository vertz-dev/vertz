import { Twitter } from 'lucide-react';

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

export function Founders() {
  return (
    <section
      id="founders"
      className="py-24 px-6"
      style={{ background: '#0e0e11', borderTop: '1px solid rgba(255,255,255,0.02)' }}
    >
      <div className="max-w-4xl mx-auto">
        <p className="text-lg leading-relaxed max-w-2xl mx-auto mb-12 text-center text-gray-300">
          We spent years stitching together ORMs, API frameworks, validation libraries, and UI
          toolkits — and watching them drift apart. We built Vertz so the next team doesn&apos;t have to.
        </p>

        <div className="grid grid-cols-2 gap-12 max-w-xl mx-auto">
          {FOUNDERS.map((f) => (
            <div key={f.name} className="text-center">
              <img
                src={f.photo}
                alt={f.name}
                className="w-20 h-20 mx-auto mb-4 rounded-full"
                style={{ objectFit: 'cover', outline: '2px solid #27272a', outlineOffset: '2px' }}
              />
              <p className="font-semibold text-lg">{f.name}</p>
              <p
                className="text-xs uppercase tracking-wider mt-1 text-gray-500"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                Co-founder
              </p>
              <p className="text-xs mt-2 leading-relaxed max-w-80 mx-auto text-gray-400">
                {f.bio}
              </p>
              <a
                href={f.x.url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 mt-3 text-xs uppercase tracking-wider transition-colors text-gray-500"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                <Twitter size={16} />
                {f.x.handle}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
