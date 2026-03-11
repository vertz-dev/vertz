export function GetStarted() {
  return (
    <section
      className="py-24 px-6"
      style={{
        background: '#0e0e11',
        borderTop: '1px solid rgba(255,255,255,0.02)',
        borderBottom: '1px solid rgba(255,255,255,0.02)',
      }}
    >
      <div className="max-w-4xl mx-auto grid grid-cols-2 gap-12 items-center">
        <div>
          <h2
            className="text-4xl mb-6"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Get started in 30 seconds.
          </h2>
          <p className="text-lg mb-4 text-gray-400">
            SQLite database, REST API, and UI — all running locally. No Docker. No config files.
            Edit any layer and see it update instantly.
          </p>
        </div>
        <div
          className="p-6 rounded-lg text-sm border bg-gray-950"
          style={{
            borderColor: '#1e1e22',
            fontFamily: 'var(--font-mono)',
            boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
          }}
        >
          <div className="mb-2 text-gray-500">$ bun create vertz my-app</div>
          <div className="mb-2 text-gray-500">$ cd my-app</div>
          <div className="text-gray-500">$ bun dev</div>
          <div className="mt-4" style={{ color: '#4ade80' }}>
            {'\u2713'} SQLite database ready
          </div>
          <div style={{ color: '#4ade80' }}>
            {'\u2713'} API server on http://localhost:3000/api
          </div>
          <div style={{ color: '#4ade80' }}>
            {'\u2713'} UI on http://localhost:3000
          </div>
        </div>
      </div>
    </section>
  );
}
