---
'@vertz/demo-toolkit': minor
---

Replace shell-based TTS with direct MiniMax Speech API integration. The new implementation:

- ✨ **Voice Cloning**: Clone any voice from an audio sample via `cloneVoice()`
- 🎙️ **Direct API**: Use MiniMax Speech 2.6 API directly (no subprocess overhead)
- 🔄 **Auto-Retry**: Automatically tries fallback endpoints on connection failures
- ⚡ **Better Performance**: No shell command overhead
- 🛡️ **Robust Errors**: Proper error handling for rate limits, auth failures, and network issues
- 📦 **Type-Safe**: Full TypeScript support with `TTSOptions` interface

**Breaking Change**: `generateTTS()` signature updated to support options:
```typescript
// Before
await generateTTS(text, outputPath);

// After (backward compatible for basic usage)
await generateTTS(text, outputPath);

// New: with options
await generateTTS(text, outputPath, {
  voiceId: 'custom-voice-123',
  speed: 1.2,
  model: 'speech-02-hd',
});
```

**Migration**: No changes needed for basic usage. To use voice cloning or advanced features, see `TTS.md`.

**Requirements**: Set `MINIMAX_API_KEY` environment variable with your MiniMax API key.
