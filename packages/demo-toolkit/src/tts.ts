/**
 * Text-to-Speech Integration
 * 
 * Generates narration audio for demo scripts.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const execAsync = promisify(exec);

/**
 * Generate TTS audio using OpenClaw's TTS system
 * 
 * This calls the OpenClaw TTS tool via shell command.
 * The TTS tool is expected to be available in the environment.
 */
export async function generateTTS(text: string, outputPath: string): Promise<void> {
  try {
    // Call OpenClaw TTS tool via shell
    // The openclaw binary should have a tts subcommand
    const { stdout, stderr } = await execAsync(
      `openclaw tts --text "${text.replace(/"/g, '\\"')}" --output "${outputPath}"`,
      { timeout: 30000 }
    );
    
    if (stderr && !stderr.includes('MEDIA:')) {
      console.warn(`TTS warning: ${stderr}`);
    }
    
    // Check if the output file was created
    try {
      await fs.access(outputPath);
    } catch {
      throw new Error('TTS output file was not created');
    }
  } catch (error) {
    // Fallback: create a silent audio file or a text marker
    console.warn(`⚠️  TTS generation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.warn(`   Creating silent placeholder for narration: "${text}"`);
    
    // Create a minimal silent MP3 (1 second of silence)
    // This is a base64-encoded silent MP3 file
    const silentMp3Base64 = 'SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v////////////////////////////////////////////////////////////////AAAAAExhdmM1OC4xMzQAAAAAAAAAAAAAAAAkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZDwAAABpAAAACAAADSAAAAEAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
    const silentMp3Buffer = Buffer.from(silentMp3Base64, 'base64');
    await fs.writeFile(outputPath, silentMp3Buffer);
  }
}

/**
 * Get the duration of an audio file in milliseconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    // Use ffprobe to get audio duration
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
    );
    const durationSeconds = parseFloat(stdout.trim());
    return Math.ceil(durationSeconds * 1000);
  } catch (error) {
    // If ffprobe fails, estimate based on text length (rough estimate: 150 words per minute)
    const words = audioPath.split(/\s+/).length;
    const minutes = words / 150;
    return Math.ceil(minutes * 60 * 1000);
  }
}

/**
 * Check if FFmpeg is available
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
 * @param videoPath - Path to the input video file
 * @param audioPath - Path to the audio file
 * @param outputPath - Path for the output file
 */
export async function combineVideoAudio(
  videoPath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  const hasFFmpeg = await checkFFmpeg();
  
  if (!hasFFmpeg) {
    console.warn('⚠️  FFmpeg not found. Skipping audio/video muxing.');
    console.warn('   Install FFmpeg to enable narration: apt-get install ffmpeg');
    // Just copy the video file as-is
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  // Combine video and audio
  await execAsync(
    `ffmpeg -i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`
  );
}

/**
 * Create a complex audio timeline from multiple narration clips
 * 
 * This uses FFmpeg's filter_complex to overlay multiple audio clips
 * at specific timestamps.
 */
export async function createAudioTimeline(
  clips: Array<{ audioPath: string; timestamp: number }>,
  duration: number,
  outputPath: string
): Promise<void> {
  const hasFFmpeg = await checkFFmpeg();
  
  if (!hasFFmpeg || clips.length === 0) {
    // Create a silent audio file or skip
    return;
  }

  if (clips.length === 1) {
    // Simple case: just copy the audio file
    await fs.copyFile(clips[0].audioPath, outputPath);
    return;
  }

  // Build FFmpeg filter_complex command for multiple audio clips
  const inputs = clips.map((clip) => `-i "${clip.audioPath}"`).join(' ');
  const delays = clips.map((clip, i) => `[${i}]adelay=${clip.timestamp}|${clip.timestamp}[a${i}]`);
  const mix = clips.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${clips.length}:duration=longest`;
  const filterComplex = `${delays.join(';')};${mix}`;

  await execAsync(
    `ffmpeg ${inputs} -filter_complex "${filterComplex}" -t ${duration / 1000} "${outputPath}"`
  );
}
