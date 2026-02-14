/**
 * Script Runner
 *
 * Executes demo scripts with timing and coordination.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { BadRequestException } from '@vertz/core';
import { calculateDelay, type DemoRecorder } from './recorder.js';
import { generateTTS, getAudioDuration } from './tts.js';
import { combineVideoAudio, createAudioTimeline } from './muxing.js';
import type { DelayConfig, DemoAction, DemoResult, DemoScript, NarrationClip } from './types.js';

/**
 * Execute a demo script and record it
 */
export async function runDemoScript(
  script: DemoScript,
  recorder: DemoRecorder,
): Promise<DemoResult> {
  const startTime = Date.now();
  const screenshots: string[] = [];
  const narrationClips: NarrationClip[] = [];
  let videoPath: string | undefined;
  let currentTimestamp = 0;

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

      // Track timestamp before action
      const actionStartTime = Date.now();

      await executeAction(action, recorder, screenshots, narrationClips, currentTimestamp);

      // Update current timestamp
      const actionDuration = Date.now() - actionStartTime;
      currentTimestamp += actionDuration;

      // Add delay between actions (except after the last one)
      if (i < script.actions.length - 1) {
        const delay = calculateDelay(defaultDelay.base, defaultDelay.variance);
        await recorder.wait(delay);
        currentTimestamp += delay;
      }
    }

    // Extra wait before closing to ensure video captures everything
    await recorder.wait(1000);
    currentTimestamp += 1000;

    // Close and get video path
    const rawVideoPath = await recorder.close();

    if (rawVideoPath) {
      const outputPath = path.join(recorder.getOutputDir(), script.outputPath);

      // If we have narration clips, combine them with the video
      if (narrationClips.length > 0) {
        console.log(`   🎙️  Processing ${narrationClips.length} narration clip(s)...`);

        // Create audio timeline
        const audioTimelinePath = path.join(recorder.getOutputDir(), `${script.id}-audio.mp3`);
        await createAudioTimeline(
          narrationClips.map((clip) => ({ audioPath: clip.audioPath, timestamp: clip.timestamp })),
          currentTimestamp,
          audioTimelinePath,
        );

        // Combine video and audio
        const finalOutputPath = outputPath.replace('.webm', '-narrated.webm');
        await combineVideoAudio(rawVideoPath, audioTimelinePath, finalOutputPath);

        // Clean up intermediate files
        await fs.unlink(rawVideoPath).catch(() => {});
        await fs.unlink(audioTimelinePath).catch(() => {});

        videoPath = finalOutputPath;
        console.log(`   🎙️  Narration added to video`);
      } else {
        // No narration, just rename the video
        await fs.rename(rawVideoPath, outputPath);
        videoPath = outputPath;
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Demo completed in ${(duration / 1000).toFixed(2)}s`);
    if (videoPath) {
      console.log(`   Video: ${videoPath}`);
    }
    console.log(`   Screenshots: ${screenshots.length}`);
    if (narrationClips.length > 0) {
      console.log(`   Narration clips: ${narrationClips.length}`);
    }

    return {
      id: script.id,
      success: true,
      duration,
      videoPath,
      screenshots,
      narrationClips: narrationClips.length,
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
      narrationClips: narrationClips.length,
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
  screenshots: string[],
  narrationClips: NarrationClip[],
  currentTimestamp: number,
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

    case 'narrate': {
      const audioPath = path.join(
        recorder.getOutputDir(),
        `narration-${narrationClips.length + 1}.mp3`,
      );

      // Generate TTS audio
      await generateTTS(action.text, audioPath);

      // Get audio duration
      const duration = await getAudioDuration(audioPath);

      narrationClips.push({
        text: action.text,
        audioPath,
        timestamp: currentTimestamp,
        duration,
      });

      // Wait for the audio to "play" (simulate narration time)
      await recorder.wait(duration);
      break;
    }

    case 'custom':
      await action.fn(recorder.getPage());
      break;

    default: {
      const _action = action as DemoAction;
      throw new BadRequestException(`Unknown action type: ${_action.type}`);
    }
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
    case 'narrate':
      return `🎙️  Narrate: "${action.text.substring(0, 50)}${action.text.length > 50 ? '...' : ''}"`;
    case 'custom':
      return action.description ?? 'Custom action';
    default:
      return 'Unknown action';
  }
}
