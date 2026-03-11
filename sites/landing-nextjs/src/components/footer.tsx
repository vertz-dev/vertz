export function Footer() {
  return (
    <footer className="py-12 px-6 border-t" style={{ borderColor: '#1e1e22' }}>
      <div
        className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap text-xs uppercase tracking-wider text-gray-500 font-[family-name:var(--font-mono)]"
      >
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/vertz-dev/vertz"
            target="_blank"
            rel="noopener"
            className="transition-colors"
          >
            GitHub
          </a>
          <span className="text-gray-700">|</span>
          <a
            href="https://x.com/vinicius_dacal"
            target="_blank"
            rel="noopener"
            className="transition-colors"
          >
            @vinicius_dacal
          </a>
          <span className="text-gray-700">|</span>
          <a
            href="https://x.com/matheeuspoleza"
            target="_blank"
            rel="noopener"
            className="transition-colors"
          >
            @matheeuspoleza
          </a>
        </div>
        <div className="flex items-center gap-4">
          <span>MIT License</span>
          <span className="text-gray-700">|</span>
          <span>Powered by Bun</span>
        </div>
      </div>
    </footer>
  );
}
