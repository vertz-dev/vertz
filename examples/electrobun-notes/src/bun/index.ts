/**
 * Electrobun Main Process
 *
 * Starts the Vertz API server in the same Bun process and opens a
 * BrowserWindow pointing at the local server.
 *
 * Usage:
 *   electrobun dev
 */

// @ts-expect-error - electrobun types only available when electrobun is installed
import { BrowserWindow } from 'electrobun/bun';

// Start Vertz API server in the same Bun process
const { default: app } = await import('../api/server');
const handle = await app.listen(0); // ephemeral port avoids conflicts

const _mainWindow = new BrowserWindow({
  title: 'Vertz Notes',
  url: `http://localhost:${handle.port}`,
  frame: { width: 900, height: 700, x: 200, y: 200 },
});

console.log(`Vertz Notes running at http://localhost:${handle.port}`);
