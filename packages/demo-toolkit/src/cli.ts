#!/usr/bin/env node
/**
 * Demo Recorder CLI
 * 
 * Usage: bun src/cli.ts scripts/task-manager.ts
 */

import * as path from 'node:path';
import { DemoRecorder } from './recorder.js';
import { runDemoScript } from './script-runner.js';

async function main() {
  const scriptPath = process.argv[2];

  if (!scriptPath) {
    console.error('Usage: bun src/cli.ts <script-path>');
    console.error('Example: bun src/cli.ts scripts/task-manager.ts');
    process.exit(1);
  }

  try {
    // Resolve script path
    const resolvedPath = path.resolve(scriptPath);
    console.log(`📜 Loading demo script: ${resolvedPath}`);

    // Import the demo script
    const module = await import(resolvedPath);
    const demoScript = module.taskManagerDemo || module.default;

    if (!demoScript) {
      console.error('❌ Demo script not found. Export as "taskManagerDemo" or "default"');
      process.exit(1);
    }

    // Create recorder
    const recorder = new DemoRecorder({
      baseUrl: demoScript.startUrl.startsWith('http') 
        ? demoScript.startUrl.split('/').slice(0, 3).join('/')
        : 'http://localhost:3000',
      outputDir: 'demos',
      headless: true,
      video: {
        format: 'webm',
        size: { width: 1280, height: 720 },
        fps: 30,
      },
    });

    // Run the demo
    const result = await runDemoScript(demoScript, recorder);

    if (result.success) {
      console.log('\n🎉 Demo recording completed successfully!');
      process.exit(0);
    } else {
      console.error('\n💥 Demo recording failed:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

main();
