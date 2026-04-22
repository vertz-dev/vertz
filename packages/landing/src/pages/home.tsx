import { Benchmarks } from '../components/benchmarks';
import { CommunityDiscord } from '../components/community-discord';
import { Divider } from '../components/divider';
import { FAQ } from '../components/faq';
import { Features } from '../components/features';
import { Footer } from '../components/footer';
import { Founders } from '../components/founders';
import { GetStarted } from '../components/get-started';
import { Hero } from '../components/hero';
import { Nav } from '../components/nav';
import { TheStack } from '../components/the-stack';
import { UseInIde } from '../components/use-in-ide';
import { WhyVertz } from '../components/why-vertz';

function HeroGlow() {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '700px',
          height: '500px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(200,69,27,0.06) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -60%)',
          width: '350px',
          height: '350px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(200,69,27,0.03) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        data-hero-flash
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '900px',
          height: '600px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(200,69,27,0.55) 0%, transparent 70%)',
          filter: 'blur(50px)',
          opacity: '0',
          transition: 'opacity 0.8s ease-out',
        }}
      />
      <div
        data-hero-flash-peer
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '900px',
          height: '600px',
          pointerEvents: 'none',
          background: 'radial-gradient(ellipse, rgba(50,160,220,0.65) 0%, transparent 70%)',
          filter: 'blur(50px)',
          opacity: '0',
          transition: 'opacity 0.8s ease-out',
        }}
      />
    </>
  );
}

const SHOW_BENCHMARKS = false;

export function HomePage() {
  return (
    <div>
      <Nav />
      <HeroGlow />
      <main style={{ position: 'relative', zIndex: '2', overflowX: 'hidden' }}>
        <Hero />
        {SHOW_BENCHMARKS && (
          <>
            <Divider />
            <Benchmarks />
          </>
        )}
        <Divider />
        <Features />
        <Divider />
        <WhyVertz />
        <TheStack />
        <Divider />
        <GetStarted />
        <Divider />
        <UseInIde />
        <FAQ />
        <Divider />
        <Founders />
        <Divider />
        <CommunityDiscord />
      </main>
      <Footer />
    </div>
  );
}
