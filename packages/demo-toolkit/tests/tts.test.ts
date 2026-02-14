/**
 * Tests for MiniMax TTS Integration
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneVoice, generateTTS, MiniMaxTTSError, type TTSOptions } from '../src/tts';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('MiniMax TTS Integration', () => {
  let tempDir: string;
  let testOutputPath: string;

  beforeEach(async () => {
    // Create a temporary directory for test outputs
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-test-'));
    testOutputPath = path.join(tempDir, 'output.mp3');

    // Reset mocks
    mockFetch.mockReset();

    // Set test API key
    process.env.MINIMAX_API_KEY = 'test-api-key';
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Clear environment variable
    delete process.env.MINIMAX_API_KEY;
  });

  describe('generateTTS', () => {
    it('should generate TTS audio successfully with default options', async () => {
      // Mock successful API response
      const mockAudioData = Buffer.from('fake-audio-data');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockAudioData.buffer,
      });

      await generateTTS('Hello, world!', testOutputPath);

      // Verify fetch was called with correct parameters
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/t2a_v2'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('Hello, world!'),
        }),
      );

      // Verify output file was created
      const fileExists = await fs
        .access(testOutputPath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);

      // Verify file content
      const fileContent = await fs.readFile(testOutputPath);
      expect(fileContent.length).toBeGreaterThan(0);
    });

    it('should support custom voice_id option', async () => {
      const mockAudioData = Buffer.from('fake-audio-data');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockAudioData.buffer,
      });

      const options: TTSOptions = {
        voiceId: 'custom-voice-123',
      };

      await generateTTS('Test text', testOutputPath, options);

      // Verify voice_id was included in the request
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.voice_id).toBe('custom-voice-123');
    });

    it('should support speed option', async () => {
      const mockAudioData = Buffer.from('fake-audio-data');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockAudioData.buffer,
      });

      const options: TTSOptions = {
        speed: 1.5,
      };

      await generateTTS('Test text', testOutputPath, options);

      // Verify speed was included in the request
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.speed).toBe(1.5);
    });

    it('should support model option', async () => {
      const mockAudioData = Buffer.from('fake-audio-data');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockAudioData.buffer,
      });

      const options: TTSOptions = {
        model: 'speech-02-hd',
      };

      await generateTTS('Test text', testOutputPath, options);

      // Verify model was included in the request
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);
      expect(requestBody.model).toBe('speech-02-hd');
    });

    it('should throw error when API key is missing', async () => {
      delete process.env.MINIMAX_API_KEY;

      await expect(generateTTS('Test', testOutputPath)).rejects.toThrow(MiniMaxTTSError);
      await expect(generateTTS('Test', testOutputPath)).rejects.toThrow(
        'MINIMAX_API_KEY environment variable is required',
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Invalid API key' }),
      });

      await expect(generateTTS('Test', testOutputPath)).rejects.toThrow(MiniMaxTTSError);
    });

    it('should handle rate limit errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'retry-after': '60' }),
        json: async () => ({ error: 'Rate limit exceeded' }),
      });

      const options: TTSOptions = {
        retryWithFallbackEndpoints: false, // Disable retries for this test
      };

      try {
        await generateTTS('Test', testOutputPath, options);
        // Should not reach here
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeInstanceOf(MiniMaxTTSError);
        expect((error as MiniMaxTTSError).statusCode).toBe(429);
        expect((error as MiniMaxTTSError).retryAfter).toBe(60);
      }
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const options: TTSOptions = {
        retryWithFallbackEndpoints: false, // Disable retries for this test
      };

      await expect(generateTTS('Test', testOutputPath, options)).rejects.toThrow('Network error');
    });

    it('should retry with fallback endpoints on failure', async () => {
      // First endpoint fails
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'));

      // Second endpoint succeeds
      const mockAudioData = Buffer.from('fake-audio-data');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => mockAudioData.buffer,
      });

      const options: TTSOptions = {
        retryWithFallbackEndpoints: true,
      };

      await generateTTS('Test', testOutputPath, options);

      // Verify multiple endpoints were tried
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('cloneVoice', () => {
    const testAudioPath = path.join(__dirname, 'fixtures', 'test-voice.mp3');

    beforeEach(async () => {
      // Create test audio file
      const fixturesDir = path.join(__dirname, 'fixtures');
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.writeFile(testAudioPath, Buffer.from('fake-audio-file'));
    });

    afterEach(async () => {
      try {
        await fs.rm(path.join(__dirname, 'fixtures'), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it('should upload audio and return voice_id', async () => {
      // Mock successful voice cloning response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          voice_id: 'cloned-voice-123',
          status: 'ready',
        }),
      });

      const voiceId = await cloneVoice(testAudioPath, 'Test Voice');

      expect(voiceId).toBe('cloned-voice-123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/voice/clone'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
          }),
        }),
      );
    });

    it('should throw error when audio file does not exist', async () => {
      const nonExistentPath = '/tmp/nonexistent.mp3';

      await expect(cloneVoice(nonExistentPath, 'Test')).rejects.toThrow('Audio file not found');
    });

    it('should throw error when voice name is empty', async () => {
      await expect(cloneVoice(testAudioPath, '')).rejects.toThrow('Voice name is required');
    });

    it('should handle voice cloning API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: 'Invalid audio format' }),
      });

      await expect(cloneVoice(testAudioPath, 'Test')).rejects.toThrow(MiniMaxTTSError);
    });

    it('should throw error when API key is missing', async () => {
      delete process.env.MINIMAX_API_KEY;

      await expect(cloneVoice(testAudioPath, 'Test')).rejects.toThrow(
        'MINIMAX_API_KEY environment variable is required',
      );
    });
  });

  describe('MiniMaxTTSError', () => {
    it('should create error with status code', () => {
      const error = new MiniMaxTTSError('Test error', 401);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('MiniMaxTTSError');
    });

    it('should create error with retry-after', () => {
      const error = new MiniMaxTTSError('Rate limit', 429, 60);

      expect(error.statusCode).toBe(429);
      expect(error.retryAfter).toBe(60);
    });
  });
});
