/**
 * Script Runner
 * 
 * Executes demo scripts with timing and coordination.
 */

import * as path from 'node:path';
import { DemoRecorder, calculateDelay } from './recorder.js';
import type { DemoScript, DemoAction, DemoResult, DelayConfig } from './types.js';

/**
 * Execute a demo script and record it
 */
export async function runDemoScript(
  script: DemoScript,
  recorder: DemoRecorder
): Promise<DemoResult> {
  const startTime = Date.now();
  const screenshots: string[] = [];
  let videoPath: string | undefined;

  try {
    console.log(`🎬 Starting demo: ${script.name}`);
    console.log(`   ${script.description}`);

    // Initialize recorder
    await recorder.init();

    // Navigate to start URL
    console.log(`   → Navigating to ${script.startUrl}`);
    await recorder.navigate(script.startUrl);

    // Default delay configuration
    const defaultDelay: DelayConfig = script.defaultDelay ?? { base: 500, variance: 0.2 };

    // Execute each action
    for (let i = 0; i < script.actions.length; i++) {
      const action = script.actions[i];
      
      console.log(`   → Action ${i + 1}/${script.actions.length}: ${describeAction(action)}`);
      
      await executeAction(action, recorder, screenshots);

      // Add delay between actions (except after the last one)
      if (i < script.actions.length - 1) {
        const delay = calculateDelay(defaultDelay.base, defaultDelay.variance);
        await recorder.wait(delay);
      }
    }

    // Extra wait before closing to ensure video captures everything
    await recorder.wait(1000);

    // Close and get video path
    const rawVideoPath = await recorder.close();
    
    if (rawVideoPath) {
      // Move video to desired output path
      const outputPath = path.join(recorder.getOutputDir(), script.outputPath);
      const fs = await import('node:fs/promises');
      await fs.rename(rawVideoPath, outputPath);
      videoPath = outputPath;
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Demo completed in ${(duration / 1000).toFixed(2)}s`);
    if (videoPath) {
      console.log(`   Video: ${videoPath}`);
    }
    console.log(`   Screenshots: ${screenshots.length}`);

    return {
      id: script.id,
      success: true,
      duration,
      videoPath,
      screenshots,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error(`❌ Demo failed: ${errorMessage}`);

    // Ensure cleanup
    try {
      await recorder.close();
    } catch {
      // Ignore cleanup errors
    }

    return {
      id: script.id,
      success: false,
      duration,
      screenshots,
      error: errorMessage,
    };
  }
}

/**
 * Execute a single demo action
 */
async function executeAction(
  action: DemoAction,
  recorder: DemoRecorder,
  screenshots: string[]
): Promise<void> {
  switch (action.type) {
    case 'navigate':
      await recorder.navigate(action.url, action.waitFor);
      break;

    case 'click':
      await recorder.click(action.selector);
      break;

    case 'type':
      await recorder.type(action.selector, action.text);
      break;

    case 'wait':
      await recorder.wait(action.ms);
      break;

    case 'screenshot': {
      const screenshotPath = await recorder.screenshot(action.options.name);
      screenshots.push(screenshotPath);
      break;
    }

    case 'custom':
      await action.fn(recorder.getPage());
      break;

    default:
      throw new Error(`Unknown action type: ${(action as any).type}`);
  }
}

/**
 * Generate a human-readable description of an action
 */
function describeAction(action: DemoAction): string {
  switch (action.type) {
    case 'navigate':
      return `Navigate to ${action.url}`;
    case 'click':
      return action.description ?? `Click ${action.selector}`;
    case 'type':
      return action.description ?? `Type "${action.text}" into ${action.selector}`;
    case 'wait':
      return action.description ?? `Wait ${action.ms}ms`;
    case 'screenshot':
      return `Screenshot: ${action.options.name}`;
    case 'custom':
      return action.description ?? 'Custom action';
    default:
      return 'Unknown action';
  }
}
