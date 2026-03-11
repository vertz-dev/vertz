import { GlueCode } from '@/components/glue-code';
import { Hero } from '@/components/hero';
import { SchemaFlow } from '@/components/schema-flow';
import { TypeErrorDemo } from '@/components/type-error-demo';
import { WhyVertz } from '@/components/why-vertz';
import { TheStack } from '@/components/the-stack';
import { GetStarted } from '@/components/get-started';
import { FAQ } from '@/components/faq';
import { Founders } from '@/components/founders';

function Divider() {
  return (
    <div style={{
      height: '1px',
      width: '100%',
      maxWidth: '56rem',
      margin: '3rem auto',
      background: 'linear-gradient(to right, transparent, #1e1e22, transparent)',
    }} />
  );
}

function HeroGlow() {
  return (
    <>
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '700px', height: '500px', pointerEvents: 'none',
        background: 'radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -60%)',
        width: '350px', height: '350px', pointerEvents: 'none',
        background: 'radial-gradient(ellipse, rgba(139,92,246,0.04) 0%, transparent 70%)',
        filter: 'blur(40px)',
      }} />
    </>
  );
}

export default function HomePage() {
  return (
    <>
      <HeroGlow />
      <main style={{ position: 'relative' }}>
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
    </>
  );
}
