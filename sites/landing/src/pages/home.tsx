import { Island } from '@vertz/ui';

import { Benchmarks } from '../components/benchmarks';
import { FAQ } from '../components/faq';
import { Features } from '../components/features';
import { Footer } from '../components/footer';
import { Founders } from '../components/founders';
import { GetStarted } from '../components/get-started';
import { Hero } from '../components/hero';
import { Nav } from '../components/nav';
import PresenceOverlay from '../components/presence-overlay';
import { TheStack } from '../components/the-stack';
import { WhyVertz } from '../components/why-vertz';

function Divider() {
  return (
    <div style={{ height: '1px', width: '100%', maxWidth: '56rem', margin: '3rem auto', background: 'linear-gradient(to right, transparent, #2A2826, transparent)' }} />
  );
}

function HeroGlow() {
  return (
    <>
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '700px', height: '500px', pointerEvents: 'none', background: 'radial-gradient(ellipse, rgba(200,69,27,0.06) 0%, transparent 70%)', filter: 'blur(60px)' }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -60%)', width: '350px', height: '350px', pointerEvents: 'none', background: 'radial-gradient(ellipse, rgba(200,69,27,0.03) 0%, transparent 70%)', filter: 'blur(40px)' }} />
    </>
  );
}

const SHOW_BENCHMARKS = false;

export function HomePage() {
  return (
    <div>
      <Nav />
      <HeroGlow />
      <Island component={PresenceOverlay} />
      <main style={{ position: 'relative', overflowX: 'hidden' }}>
        <Hero />
        {SHOW_BENCHMARKS && <><Divider /><Benchmarks /></>}
        <Divider />
        <Features />
        <Divider />
        <WhyVertz />
        <TheStack />
        <Divider />
        <GetStarted />
        <FAQ />
        <Divider />
        <Founders />
      </main>
      <Footer />
    </div>
  );
}
