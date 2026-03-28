// ── Dev launcher — spawns Vertz dev server + presence WebSocket server ──
// Forwards SIGINT/SIGTERM to both child processes and exits when either crashes.

const children: ReturnType<typeof Bun.spawn>[] = [];

function killAll() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // Already dead
    }
  }
}

function onSignal() {
  killAll();
  process.exit(0);
}

process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

// Start the Vertz dev server (frontend)
const devServer = Bun.spawn(['bun', 'run', 'src/dev-server.ts'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: import.meta.dir + '/..',
});
children.push(devServer);

// Start the presence WebSocket server
const presenceServer = Bun.spawn(['bun', 'run', 'src/presence-dev-server.ts'], {
  stdio: ['inherit', 'inherit', 'inherit'],
  cwd: import.meta.dir + '/..',
});
children.push(presenceServer);

// Exit if either process dies
async function watchProcess(proc: ReturnType<typeof Bun.spawn>, name: string) {
  const code = await proc.exited;
  console.log(`\n  ${name} exited with code ${code}`);
  killAll();
  process.exit(code);
}

watchProcess(devServer, 'Dev server');
watchProcess(presenceServer, 'Presence server');
