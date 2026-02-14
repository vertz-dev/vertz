/**
 * Tests for Audio/Video Muxing Integration
 *
 * Note: These tests validate the module structure and exports.
 * Full integration testing requires FFmpeg to be installed.
 */

import { describe, it, expect } from 'vitest';
import type { AudioClip } from '../src/muxing';

// Import functions to verify exports
import {
  checkFFmpeg,
  combineVideoAudio,
  createAudioTimeline,
} from '../src/muxing';

describe('Audio/Video Muxing Module', () => {
  describe('Module Structure', () => {
    it('should export checkFFmpeg function', () => {
      expect(typeof checkFFmpeg).toBe('function');
    });

    it('should export combineVideoAudio function', () => {
      expect(typeof combineVideoAudio).toBe('function');
    });

    it('should export createAudioTimeline function', () => {
      expect(typeof createAudioTimeline).toBe('function');
    });
  });

  describe('Type Definitions', () => {
    it('should define AudioClip type correctly', () => {
      const clip: AudioClip = {
        audioPath: '/path/to/audio.mp3',
        timestamp: 1000,
      };

      expect(clip.audioPath).toBe('/path/to/audio.mp3');
      expect(clip.timestamp).toBe(1000);
    });
  });

  describe('Function Signatures', () => {
    it('checkFFmpeg should return a Promise<boolean>', () => {
      const result = checkFFmpeg();
      expect(result).toBeInstanceOf(Promise);
    });

    it('combineVideoAudio should accept correct parameters', async () => {
      // This test validates the signature without actually calling FFmpeg
      const fn = combineVideoAudio;
      expect(fn.length).toBe(3); // videoPath, audioPath, outputPath
    });

    it('createAudioTimeline should accept correct parameters', async () => {
      const fn = createAudioTimeline;
      expect(fn.length).toBe(3); // clips, duration, outputPath
    });
  });
});
