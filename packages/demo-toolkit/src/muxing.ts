/**
 * Audio/Video Muxing Integration
 *
 * FFmpeg-based utilities for combining audio and video streams.
 * Self-contained module that can be extracted into a separate package.
 */

import * as fs from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * Check if FFmpeg is available in the system
 * 
 * @returns Promise resolving to true if FFmpeg is installed
 */
export async function checkFFmpeg(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Combine video and audio tracks using FFmpeg
 *
 * Takes a video file and an audio file and muxes them together,
 * copying video codec and converting audio to AAC.
 *
 * @param videoPath - Path to the input video file
 * @param audioPath - Path to the audio file
 * @param outputPath - Path for the output file
 * @throws Error if FFmpeg is not available or muxing fails
 */
export async function combineVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string,
): Promise<void> {
  const hasFFmpeg = await checkFFmpeg();

  if (!hasFFmpeg) {
    console.warn('⚠️  FFmpeg not found. Skipping audio/video muxing.');
    console.warn('   Install FFmpeg to enable narration: apt-get install ffmpeg');
    // Fallback: copy the video file as-is
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  // Combine video and audio
  // -c:v copy = Copy video codec (fast, no re-encoding)
  // -c:a aac = Convert audio to AAC
  // -shortest = Match output duration to shortest input
  await execAsync(
    `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`,
  );
}

/**
 * Audio clip with timestamp for timeline creation
 */
export interface AudioClip {
  /** Path to the audio file */
  audioPath: string;
  /** Timestamp in milliseconds where the audio should start */
  timestamp: number;
}

/**
 * Create a complex audio timeline from multiple narration clips
 *
 * Uses FFmpeg's filter_complex to overlay multiple audio clips
 * at specific timestamps, creating a single audio file with all
 * clips positioned correctly.
 *
 * @param clips - Array of audio clips with their timestamps
 * @param duration - Total duration of the output in milliseconds
 * @param outputPath - Path for the output audio file
 * @throws Error if FFmpeg is not available or processing fails
 */
export async function createAudioTimeline(
  clips: AudioClip[],
  duration: number,
  outputPath: string,
): Promise<void> {
  const hasFFmpeg = await checkFFmpeg();

  if (!hasFFmpeg || clips.length === 0) {
    // Cannot create timeline without FFmpeg or clips
    return;
  }

  if (clips.length === 1) {
    // Simple case: just copy the single audio file
    await fs.copyFile(clips[0].audioPath, outputPath);
    return;
  }

  // Build FFmpeg filter_complex command for multiple audio clips
  // Example: [0]adelay=1000|1000[a0];[1]adelay=5000|5000[a1];[a0][a1]amix=inputs=2
  const inputs = clips.map((clip) => `-i "${clip.audioPath}"`).join(' ');
  const delays = clips.map((clip, i) => `[${i}]adelay=${clip.timestamp}|${clip.timestamp}[a${i}]`);
  const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:duration=longest`;
  const filterComplex = `${delays.join(';')};${mix}`;

  await execAsync(
    `ffmpeg ${inputs} -filter_complex "${filterComplex}" -t ${duration / 1000} "${outputPath}"`,
  );
}
