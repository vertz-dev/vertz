import { FAQ } from '../components/faq';
import { Footer } from '../components/footer';
import { Founders } from '../components/founders';
import { GetStarted } from '../components/get-started';
import { GlueCode } from '../components/glue-code';
import { Hero } from '../components/hero';
import { Nav } from '../components/nav';
import { SchemaFlow } from '../components/schema-flow';
import { TheStack } from '../components/the-stack';
import { TypeErrorDemo } from '../components/type-error-demo';
import { WhyVertz } from '../components/why-vertz';

function Divider() {
  return (
    <div style="height: 1px; width: 100%; max-width: 56rem; margin: 3rem auto; background: linear-gradient(to right, transparent, #1e1e22, transparent)" />
  );
}

function HeroGlow() {
  return (
    <>
      <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 700px; height: 500px; pointer-events: none; background: radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%); filter: blur(60px)" />
      <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -60%); width: 350px; height: 350px; pointer-events: none; background: radial-gradient(ellipse, rgba(139,92,246,0.04) 0%, transparent 70%); filter: blur(40px)" />
    </>
  );
}

export function HomePage() {
  return (
    <div>
      <Nav />
      <HeroGlow />
      <main style="position: relative">
        <Hero />
        <GlueCode />
        <SchemaFlow />
        <TypeErrorDemo />
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
