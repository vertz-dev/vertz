# MiniMax TTS Integration

Direct integration with MiniMax Speech 2.6 API for high-quality text-to-speech generation and voice cloning.

## Overview

This module provides direct API integration with MiniMax Speech API, replacing the previous shell-based approach. Key features include:

- 🎙️ **Voice Cloning** - Clone any voice from an audio sample
- 🔊 **High-Quality TTS** - Generate natural-sounding speech with MiniMax Speech 2.6
- 🔄 **Automatic Fallbacks** - Tries multiple endpoints for reliability
- ⚡ **Fast & Direct** - No subprocess overhead
- 🛡️ **Robust Error Handling** - Graceful handling of rate limits and network issues

## Quick Start

### Basic TTS Generation

```typescript
import { generateTTS } from '@vertz/demo-toolkit';

// Generate speech from text
await generateTTS(
  'Hello! This is a demo of MiniMax TTS.',
  './output/narration.mp3'
);
```

### Voice Cloning

```typescript
import { cloneVoice, generateTTS } from '@vertz/demo-toolkit';

// Step 1: Clone a voice from an audio sample
const voiceId = await cloneVoice(
  './samples/vinicius-voice.mp3',
  'Vinicius Demo Voice'
);

// Step 2: Use the cloned voice for TTS
await generateTTS(
  'This demo uses Vinicius's cloned voice!',
  './output/demo-narration.mp3',
  { voiceId }
);
```

### Advanced Options

```typescript
await generateTTS('Demo text', './output.mp3', {
  voiceId: 'custom-voice-123',    // Use custom or cloned voice
  speed: 1.2,                      // Speech speed (0.5 - 2.0)
  model: 'speech-02-hd',          // Model selection
  format: 'mp3',                   // Audio format
  sampleRate: 24000,              // Sample rate in Hz
  retryWithFallbackEndpoints: true, // Auto-retry on failure
  timeout: 30000,                  // Request timeout (ms)
});
```

## API Reference

### `generateTTS(text, outputPath, options?)`

Generate TTS audio from text.

**Parameters:**
- `text` (string) - Text to convert to speech
- `outputPath` (string) - Path where audio file will be saved
- `options` (TTSOptions, optional) - Configuration options

**Returns:** `Promise<void>`

**Throws:** `MiniMaxTTSError` on API errors or configuration issues

**Example:**
```typescript
try {
  await generateTTS('Hello world', './output.mp3', {
    speed: 1.5,
    model: 'speech-02-hd',
  });
} catch (error) {
  if (error instanceof MiniMaxTTSError) {
    console.error('TTS Error:', error.message);
    console.error('Status:', error.statusCode);
  }
}
```

### `cloneVoice(audioFilePath, voiceName)`

Clone a voice from an audio sample.

**Parameters:**
- `audioFilePath` (string) - Path to audio file containing voice sample
- `voiceName` (string) - Name to assign to the cloned voice

**Returns:** `Promise<string>` - Voice ID that can be used with `generateTTS()`

**Throws:** `MiniMaxTTSError` on API errors or invalid input

**Example:**
```typescript
// Clone from an MP3 recording
const voiceId = await cloneVoice(
  './samples/speaker-sample.mp3',
  'Product Demo Voice'
);

// Use in subsequent TTS calls
await generateTTS('Demo narration', './demo.mp3', { voiceId });
```

### `TTSOptions`

Configuration options for TTS generation.

```typescript
interface TTSOptions {
  /** Voice ID (preset or cloned) */
  voiceId?: string;
  
  /** Speech speed multiplier (0.5 - 2.0, default: 1.0) */
  speed?: number;
  
  /** Model: 'speech-02-hd' | 'speech-02' | 'speech-01-hd' | 'speech-01' */
  model?: string;
  
  /** Audio format: 'mp3' | 'wav' | 'pcm' */
  format?: 'mp3' | 'wav' | 'pcm';
  
  /** Sample rate in Hz (default: 24000) */
  sampleRate?: number;
  
  /** Auto-retry with fallback endpoints (default: true) */
  retryWithFallbackEndpoints?: boolean;
  
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  
  /** Group ID for MiniMax API (if required) */
  groupId?: string;
}
```

### `MiniMaxTTSError`

Custom error class for TTS-related errors.

**Properties:**
- `message` (string) - Error message
- `statusCode` (number | undefined) - HTTP status code if API error
- `retryAfter` (number | undefined) - Seconds to wait before retry (for rate limits)

**Example:**
```typescript
catch (error) {
  if (error instanceof MiniMaxTTSError) {
    if (error.statusCode === 429) {
      console.log(`Rate limited. Retry after ${error.retryAfter} seconds`);
    }
  }
}
```

## Configuration

### API Key Setup

Set the `MINIMAX_API_KEY` environment variable:

```bash
export MINIMAX_API_KEY="your-api-key-here"
```

Or in your `.env` file:
```
MINIMAX_API_KEY=your-api-key-here
```

### Available Models

| Model | Quality | Speed | Use Case |
|-------|---------|-------|----------|
| `speech-02-hd` | Highest | Slower | Production demos, marketing |
| `speech-02` | High | Fast | General demos |
| `speech-01-hd` | Good | Faster | Quick demos |
| `speech-01` | Standard | Fastest | Testing, development |

## Error Handling

The module provides comprehensive error handling:

### Rate Limiting (429)

```typescript
try {
  await generateTTS(text, output);
} catch (error) {
  if (error instanceof MiniMaxTTSError && error.statusCode === 429) {
    const retrySeconds = error.retryAfter || 60;
    console.log(`Rate limited. Waiting ${retrySeconds} seconds...`);
    await new Promise(resolve => setTimeout(resolve, retrySeconds * 1000));
    await generateTTS(text, output); // Retry
  }
}
```

### Authentication Errors (401)

```typescript
try {
  await generateTTS(text, output);
} catch (error) {
  if (error instanceof MiniMaxTTSError && error.statusCode === 401) {
    console.error('Invalid API key. Check MINIMAX_API_KEY environment variable.');
  }
}
```

### Network Failures

The module automatically retries with fallback endpoints:

```typescript
// This will try multiple endpoints automatically
await generateTTS(text, output, {
  retryWithFallbackEndpoints: true, // default
});

// Or disable for single-endpoint behavior
await generateTTS(text, output, {
  retryWithFallbackEndpoints: false,
});
```

## Best Practices

### Voice Cloning

1. **Audio Quality:** Use high-quality audio samples (clear voice, minimal background noise)
2. **Sample Length:** 10-30 seconds of clean speech is ideal
3. **Format:** MP3 or WAV formats work best
4. **Cache Voice IDs:** Store voice IDs for reuse across demos

### Performance

1. **Batch Operations:** Clone voices once, reuse for multiple demos
2. **Timeout Tuning:** Adjust timeout based on text length and network
3. **Error Recovery:** Implement retry logic with exponential backoff

### Demo Workflow

```typescript
import { cloneVoice, generateTTS } from '@vertz/demo-toolkit';

// Setup phase (run once)
const demoVoiceId = await cloneVoice(
  './assets/presenter-voice.mp3',
  'Demo Presenter'
);

// Save for reuse
await fs.writeFile('./config/voice-id.txt', demoVoiceId);

// Production phase (run for each demo)
const voiceId = await fs.readFile('./config/voice-id.txt', 'utf-8');
await generateTTS(scriptText, './demo-narration.mp3', { 
  voiceId,
  model: 'speech-02-hd',
  speed: 1.1,
});
```

## Migration from Shell-based TTS

### Before (using `openclaw tts`)

```typescript
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

await execAsync(
  `openclaw tts --text "${text}" --output "${outputPath}"`
);
```

### After (using MiniMax API)

```typescript
import { generateTTS } from '@vertz/demo-toolkit';

await generateTTS(text, outputPath);
```

### Benefits

- ✅ No subprocess overhead
- ✅ Better error handling
- ✅ Voice cloning support
- ✅ Type-safe API
- ✅ Automatic retries
- ✅ Direct control over options

## Troubleshooting

### "MINIMAX_API_KEY environment variable is required"

Set your API key:
```bash
export MINIMAX_API_KEY="your-key"
```

### "Rate limit exceeded"

Wait for the retry period or implement backoff:
```typescript
if (error.statusCode === 429) {
  await new Promise(r => setTimeout(r, error.retryAfter * 1000));
}
```

### "Failed to generate TTS from all endpoints"

Check network connectivity and API key validity. Try with `retryWithFallbackEndpoints: false` to see specific endpoint errors.

### Voice cloning not working

- Ensure audio file exists and is readable
- Check audio format (MP3 or WAV recommended)
- Verify audio sample has clear speech
- Check API key permissions for voice cloning

## Examples

See the `demos/` directory for complete examples:
- Basic TTS generation
- Voice cloning workflow
- Error handling patterns
- Demo script narration

## API Endpoints

The module uses these endpoints (in order):
1. `https://api.minimax.chat/v1/t2a_v2`
2. `https://api.minimax.chat/v1/tts/generation`
3. `https://api.minimaxi.com/v1/t2a_v2`

Voice cloning:
- `https://api.minimax.chat/v1/voice/clone`

## Support

For issues or questions:
- Check the [MiniMax API documentation](https://www.minimaxi.com/document/)
- Review error messages and status codes
- Enable retry logs for debugging
