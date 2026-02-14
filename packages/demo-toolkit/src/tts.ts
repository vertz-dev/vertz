/**
 * Text-to-Speech Integration using MiniMax Speech API
 *
 * Direct integration with MiniMax Speech 2.6 API for TTS generation
 * and voice cloning capabilities.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Custom error class for MiniMax TTS errors
 */
export class MiniMaxTTSError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = 'MiniMaxTTSError';
    Object.setPrototypeOf(this, MiniMaxTTSError.prototype);
  }
}

/**
 * Options for TTS generation
 */
export interface TTSOptions {
  /**
   * Voice ID to use for synthesis
   * Can be a preset voice or a custom cloned voice ID
   */
  voiceId?: string;

  /**
   * Speech speed multiplier (0.5 - 2.0)
   * Default: 1.0
   */
  speed?: number;

  /**
   * Model to use for synthesis
   * Options: 'speech-02-hd', 'speech-02', 'speech-01-hd', 'speech-01'
   * Default: 'speech-02-hd'
   */
  model?: string;

  /**
   * Audio format
   * Default: 'mp3'
   */
  format?: 'mp3' | 'wav' | 'pcm';

  /**
   * Sample rate in Hz
   * Default: 24000
   */
  sampleRate?: number;

  /**
   * Whether to retry with fallback endpoints on failure
   * Default: true
   */
  retryWithFallbackEndpoints?: boolean;

  /**
   * Request timeout in milliseconds
   * Default: 30000
   */
  timeout?: number;

  /**
   * Group ID for MiniMax API (if required)
   */
  groupId?: string;
}

/**
 * Available MiniMax TTS API endpoints
 * Ordered by priority - will try each one in sequence if previous fails
 */
const MINIMAX_ENDPOINTS = [
  'https://api.minimax.chat/v1/t2a_v2',
  'https://api.minimax.chat/v1/tts/generation',
  'https://api.minimaxi.com/v1/t2a_v2',
];

/**
 * Voice cloning endpoint
 */
const VOICE_CLONE_ENDPOINT = 'https://api.minimax.chat/v1/voice/clone';

/**
 * Default TTS options
 */
const DEFAULT_OPTIONS: Required<Omit<TTSOptions, 'voiceId' | 'groupId'>> = {
  speed: 1.0,
  model: 'speech-02-hd',
  format: 'mp3',
  sampleRate: 24000,
  retryWithFallbackEndpoints: true,
  timeout: 30000,
};

/**
 * Get API key from environment
 */
function getApiKey(): string {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new MiniMaxTTSError('MINIMAX_API_KEY environment variable is required');
  }
  return apiKey;
}

/**
 * Make a request to MiniMax API with timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Generate TTS audio using MiniMax Speech API
 *
 * @param text - Text to convert to speech
 * @param outputPath - Path where the audio file will be saved
 * @param options - Optional TTS configuration
 */
export async function generateTTS(
  text: string,
  outputPath: string,
  options: TTSOptions = {},
): Promise<void> {
  const apiKey = getApiKey();
  const config = { ...DEFAULT_OPTIONS, ...options };

  // Build request body
  const requestBody: Record<string, any> = {
    text,
    model: config.model,
  };

  // Add speed at top level (not nested)
  if (options.speed !== undefined) {
    requestBody.speed = options.speed;
  }

  if (options.voiceId) {
    requestBody.voice_id = options.voiceId;
  }

  if (options.groupId) {
    requestBody.group_id = options.groupId;
  }

  if (options.format) {
    requestBody.format = options.format;
  }

  if (options.sampleRate) {
    requestBody.sample_rate = options.sampleRate;
  }

  // Request options
  const fetchOptions: RequestInit = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  };

  // Try endpoints in sequence
  const endpointsToTry = config.retryWithFallbackEndpoints
    ? MINIMAX_ENDPOINTS
    : [MINIMAX_ENDPOINTS[0]];

  let lastError: Error | null = null;

  for (const endpoint of endpointsToTry) {
    try {
      const response = await fetchWithTimeout(endpoint, fetchOptions, config.timeout);

      // Check if response is valid
      if (!response) {
        throw new Error('No response received from server');
      }

      if (!response.ok) {
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const retryAfterSeconds = retryAfter ? parseInt(retryAfter, 10) : undefined;

          let errorMessage = 'Rate limit exceeded';
          if (retryAfterSeconds) {
            errorMessage += `. Retry after ${retryAfterSeconds} seconds`;
          }

          throw new MiniMaxTTSError(errorMessage, 429, retryAfterSeconds);
        }

        // Handle other HTTP errors
        let errorMessage = `MiniMax API error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage += ` - ${errorData.error}`;
          }
        } catch {
          // Ignore JSON parse errors
        }

        throw new MiniMaxTTSError(errorMessage, response.status);
      }

      // Download audio data
      const audioData = await response.arrayBuffer();

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Write audio file
      await fs.writeFile(outputPath, Buffer.from(audioData));

      // Success - exit function
      return;
    } catch (error) {
      lastError = error as Error;

      // If this is a MiniMaxTTSError (API error), don't retry with other endpoints
      if (error instanceof MiniMaxTTSError) {
        throw error;
      }

      // If this is the last endpoint, break and throw
      if (endpoint === endpointsToTry[endpointsToTry.length - 1]) {
        break;
      }

      // Otherwise, continue to next endpoint
      console.warn(`Failed to connect to ${endpoint}, trying next endpoint...`);
    }
  }

  // All endpoints failed
  throw lastError || new MiniMaxTTSError('Failed to generate TTS from all endpoints');
}

/**
 * Clone a voice from an audio file
 *
 * Uploads an audio sample to MiniMax and creates a custom voice ID
 * that can be used with generateTTS.
 *
 * @param audioFilePath - Path to the audio file containing the voice sample
 * @param voiceName - Name to assign to the cloned voice
 * @returns Promise resolving to the voice_id of the cloned voice
 */
export async function cloneVoice(audioFilePath: string, voiceName: string): Promise<string> {
  const apiKey = getApiKey();

  // Validate inputs
  if (!voiceName || voiceName.trim() === '') {
    throw new MiniMaxTTSError('Voice name is required');
  }

  // Check if audio file exists
  try {
    await fs.access(audioFilePath);
  } catch {
    throw new MiniMaxTTSError(`Audio file not found: ${audioFilePath}`);
  }

  // Read audio file
  const audioBuffer = await fs.readFile(audioFilePath);
  const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

  // Create FormData for multipart upload
  const formData = new FormData();
  formData.append('audio', audioBlob, path.basename(audioFilePath));
  formData.append('name', voiceName.trim());

  // Make request
  const response = await fetchWithTimeout(
    VOICE_CLONE_ENDPOINT,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
    30000,
  );

  if (!response.ok) {
    let errorMessage = `Voice cloning failed: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) {
        errorMessage += ` - ${errorData.error}`;
      }
    } catch {
      // Ignore JSON parse errors
    }

    throw new MiniMaxTTSError(errorMessage, response.status);
  }

  const result = await response.json();

  if (!result.voice_id) {
    throw new MiniMaxTTSError('Voice cloning response did not include voice_id');
  }

  return result.voice_id;
}

/**
 * Get the duration of an audio file in milliseconds
 *
 * Note: This is a simple estimation based on file size.
 * For accurate duration, use ffprobe or a dedicated audio analysis tool.
 *
 * @param audioPath - Path to the audio file
 * @returns Promise resolving to estimated duration in milliseconds
 */
export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const stats = await fs.stat(audioPath);
    // Rough estimate: MP3 at 128kbps ≈ 16KB per second
    const estimatedSeconds = stats.size / 16000;
    return Math.ceil(estimatedSeconds * 1000);
  } catch {
    // If file doesn't exist or can't be read, return 0
    return 0;
  }
}
