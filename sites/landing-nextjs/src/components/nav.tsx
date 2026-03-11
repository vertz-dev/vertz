import Link from 'next/link';
import { VertzLogo } from './vertz-logo';

export function Nav() {
  return (
    <nav
      className="fixed z-50 flex items-center justify-between px-6 py-4"
      style={{
        top: 0,
        left: 0,
        right: 0,
        background: 'rgba(10,10,11,0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '2px solid rgba(255,255,255,0.04)',
      }}
    >
      <Link href="/" className="flex items-center gap-2">
        <VertzLogo />
      </Link>
      <div className="flex items-center gap-6">
        <Link
          href="/manifesto"
          className="text-xs uppercase tracking-wider cursor-pointer transition-colors text-gray-500 font-[family-name:var(--font-mono)]"
        >
          Manifesto
        </Link>
        <a
          href="https://github.com/vertz-dev/vertz"
          target="_blank"
          rel="noopener"
          className="text-xs uppercase tracking-wider cursor-pointer transition-colors text-gray-500 font-[family-name:var(--font-mono)]"
        >
          GitHub
        </a>
        <a
          href="https://docs.vertz.dev"
          className="text-xs uppercase tracking-wider cursor-pointer transition-colors text-gray-500 font-[family-name:var(--font-mono)]"
        >
          Docs
        </a>
      </div>
    </nav>
  );
}
