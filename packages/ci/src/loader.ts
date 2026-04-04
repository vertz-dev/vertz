/**
 * Loader script spawned by the Rust `vtz ci` binary.
 *
 * Protocol (NDJSON over stdin/stdout):
 * 1. Load the user's ci.config.ts via dynamic import
 * 2. Send `{ type: "config", data: <config> }` to stdout
 * 3. Listen for callback evaluation requests on stdin:
 *    `{ eval: <id>, result: <TaskResult> }` → respond with `{ eval: <id>, value: boolean }`
 * 4. Exit on `{ shutdown: true }`
 */

import { createInterface } from 'node:readline';
import { getCallbacks } from './builders';
import type { TaskResult } from './types';

const configPath = process.argv[2];
if (!configPath) {
  process.stderr.write('error: no config path provided\n');
  process.exit(1);
}

const mod = await import(configPath);
const config = mod.default;

if (!config || typeof config !== 'object') {
  process.stderr.write('error: ci.config.ts must export default a pipe({...}) config\n');
  process.exit(1);
}

// Phase 1: send config
process.stdout.write(JSON.stringify({ type: 'config', data: config }) + '\n');

// Phase 2: listen for callback evaluations
// Use the callback registry from builders.ts — pipe() stores callbacks there
// when processing dep.on functions during config loading above.
const callbacks = getCallbacks();

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  try {
    const msg = JSON.parse(line) as
      | { shutdown: true }
      | { eval: number; result: TaskResult };

    if ('shutdown' in msg && msg.shutdown) break;

    if ('eval' in msg) {
      const fn = callbacks.get(msg.eval);
      try {
        const value = fn ? fn(msg.result) : false;
        process.stdout.write(JSON.stringify({ eval: msg.eval, value: !!value }) + '\n');
      } catch (err) {
        process.stdout.write(JSON.stringify({ eval: msg.eval, error: String(err) }) + '\n');
      }
    }
  } catch {
    // Malformed JSON — skip line
  }
}
