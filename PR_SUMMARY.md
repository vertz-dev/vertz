# Pull Request: Direct MiniMax Speech API Integration with Voice Cloning

**Branch:** `feat/minimax-tts-integration`  
**Base:** `main`  
**Create PR at:** https://github.com/vertz-dev/vertz/pull/new/feat/minimax-tts-integration

---

## Summary

Replace shell-based TTS with direct MiniMax Speech 2.6 API integration, adding voice cloning capabilities for demos.

## Changes

### Core Implementation
- ✨ **Direct API Integration**: Use `fetch()` to call MiniMax Speech API directly (no subprocess)
- 🎙️ **Voice Cloning**: New `cloneVoice(audioPath, name)` function to clone voices from audio samples
- 🔄 **Auto-Retry**: Automatically tries 3 fallback endpoints for reliability
- ⚡ **Performance**: Eliminates shell command overhead
- 🛡️ **Error Handling**: Proper handling of rate limits (429), auth errors (401), and network failures
- 📦 **Type Safety**: Full TypeScript support with `TTSOptions` interface

### API Features
```typescript
// Basic TTS (backward compatible)
await generateTTS('Hello world', './output.mp3');

// With options
await generateTTS('Hello world', './output.mp3', {
  voiceId: 'cloned-voice-123',
  speed: 1.2,
  model: 'speech-02-hd',
  format: 'mp3',
  sampleRate: 24000,
});

// Voice cloning
const voiceId = await cloneVoice('./samples/vinicius.mp3', 'Demo Voice');
await generateTTS('Using cloned voice!', './demo.mp3', { voiceId });
```

### Documentation
- 📚 **TTS.md**: Comprehensive API reference, examples, and migration guide
- ✅ **Test Coverage**: 16 tests covering all functionality
- 🔄 **Changeset**: Added changeset for release notes

## Testing

All TTS tests pass:
```
✓ 16 pass (generateTTS, cloneVoice, error handling, retries)
✓ Build successful
```

Test coverage includes:
- Basic TTS generation
- Custom voice, speed, model options
- Voice cloning from audio files
- Error handling (missing API key, rate limits, network errors)
- Automatic endpoint fallback
- Type safety

## Migration

### Breaking Changes
`generateTTS()` signature updated to accept optional `TTSOptions` parameter.

**Backward Compatible**: Existing code continues to work without changes:
```typescript
// This still works
await generateTTS(text, outputPath);
```

### Requirements
Set `MINIMAX_API_KEY` environment variable:
```bash
export MINIMAX_API_KEY="your-api-key"
```

### FFmpeg Functions
Preserved `combineVideoAudio()` and `createAudioTimeline()` for backward compatibility.

## Motivation

1. **Voice Cloning**: Can now clone Vinicius's voice (or any voice) for demo narration
2. **Cleaner Architecture**: Direct API calls instead of shelling out
3. **Better Control**: Full control over TTS parameters (speed, model, format)
4. **Improved Reliability**: Automatic endpoint fallback and retry logic
5. **Modern API**: Type-safe interface with proper error handling

## Use Cases

### Demo Voice Cloning Workflow
```typescript
// 1. Clone presenter's voice once
const demoVoiceId = await cloneVoice('./vinicius-sample.mp3', 'Vinicius Demo');

// 2. Use for all demo narrations
await generateTTS(script1, './demo1.mp3', { voiceId: demoVoiceId });
await generateTTS(script2, './demo2.mp3', { voiceId: demoVoiceId });
```

### Speed Control for Demos
```typescript
// Faster narration for quick demos
await generateTTS(script, './fast-demo.mp3', { speed: 1.3 });

// Slower for detailed explanations
await generateTTS(script, './detailed-demo.mp3', { speed: 0.9 });
```

## Technical Details

### API Endpoints (tried in order)
1. `https://api.minimax.chat/v1/t2a_v2`
2. `https://api.minimax.chat/v1/tts/generation`
3. `https://api.minimaxi.com/v1/t2a_v2`

Voice cloning:
- `https://api.minimax.chat/v1/voice/clone`

### Supported Models
- `speech-02-hd` (highest quality, default)
- `speech-02` (high quality, faster)
- `speech-01-hd` (good quality)
- `speech-01` (standard)

### Error Handling
- **401**: Invalid API key → throw with clear message
- **429**: Rate limit → throw with `retryAfter` seconds
- **Network errors**: Automatically retry with fallback endpoints
- **Connection failures**: Try all endpoints before failing

## Notes

- Architecture matters more than working API key (as requested)
- Can test with mock responses even if key is expired
- Designed for extensibility (easy to add new options)
- Follows strict TDD approach (tests written first)

## Checklist

- ✅ Use clean git worktree from main
- ✅ Follow strict TDD (tests written first)
- ✅ No shell commands (pure `fetch()` API)
- ✅ Support voice cloning
- ✅ Support standard TTS with options
- ✅ API key from env (never hardcoded)
- ✅ Graceful error handling
- ✅ Add changeset
- ✅ Create PR targeting main

## Files Changed

1. **packages/demo-toolkit/src/tts.ts** - New MiniMax API implementation
2. **packages/demo-toolkit/tests/tts.test.ts** - Comprehensive test suite (16 tests)
3. **packages/demo-toolkit/TTS.md** - Complete documentation
4. **.changeset/minimax-tts-integration.md** - Changeset for release

## Documentation

See `packages/demo-toolkit/TTS.md` for:
- Complete API reference
- Usage examples
- Migration guide
- Error handling patterns
- Best practices
- Troubleshooting guide

---

**Ready to merge after code review!** 🚀
