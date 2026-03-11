'use client';

import { useState } from 'react';

export function Hero() {
  return (
    <section className="flex flex-col items-center justify-center px-6 min-h-screen text-center">
      {/* Badge */}
      <div className="flex items-center gap-2 mb-8">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full opacity-40" style={{ background: '#60a5fa' }} />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#3b82f6' }} />
        </span>
        <span className="text-xs tracking-widest uppercase text-gray-500 font-[family-name:var(--font-mono)]">
          Public Beta
        </span>
      </div>

      {/* Headline */}
      <h1
        className="max-w-4xl font-[family-name:var(--font-display)]"
        style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', letterSpacing: '-0.025em', lineHeight: 1.1 }}
      >
        <span className="block">One command.</span>
        <span className="block text-gray-400">Full stack. Running.</span>
      </h1>

      {/* Description */}
      <p className="mt-8 text-xl max-w-2xl leading-relaxed text-gray-400">
        One command. Database, API, and UI — running locally.{' '}
        <span className="font-medium text-gray-200">
          Define your schema once. Everything else is derived. Zero config.
        </span>
      </p>

      {/* CTAs */}
      <div className="mt-12 flex flex-row items-center gap-4">
        <CopyButton />
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          className="inline-flex items-center justify-center gap-2 py-3 px-6 text-sm uppercase tracking-wider transition-colors text-gray-400 font-[family-name:var(--font-mono)]"
        >
          View on GitHub →
        </a>
      </div>
    </section>
  );
}

function CopyButton() {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    navigator.clipboard.writeText('bun create vertz my-app');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-center justify-between gap-4 py-3 px-6 text-sm cursor-pointer border-2 bg-transparent text-[#fafafa]"
      style={{
        fontFamily: 'var(--font-mono)',
        borderColor: '#1e1e22',
        boxShadow: '4px 4px 0 rgba(255,255,255,0.06)',
        transition: 'all 0.15s',
      }}
    >
      <span className="text-gray-500">$</span> bun create vertz my-app
      <span className="text-xs text-gray-500">{copied ? 'Copied!' : '(click to copy)'}</span>
    </button>
  );
}
