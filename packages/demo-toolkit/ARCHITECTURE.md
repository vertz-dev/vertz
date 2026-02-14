# Demo Toolkit Architecture

## Design Philosophy

The demo-toolkit is designed as a **collection of self-contained, extractable modules**. Each capability (TTS, recording, muxing, etc.) is intentionally isolated so it can:

1. **Be extracted into its own npm package** (e.g., `@vertz/tts`, `@vertz/video-muxing`)
2. **Become a standalone microservice** with minimal refactoring
3. **Be tested in complete isolation** without dependencies on other toolkit modules
4. **Be configured independently** via environment variables or passed options

## Module Structure

### Current Modules

```
demo-toolkit/
├── src/
│   ├── tts.ts           # Text-to-Speech (MiniMax API)
│   ├── muxing.ts        # Audio/Video combining (FFmpeg)
│   ├── recorder.ts      # Browser-based demo recording (Playwright)
│   ├── script-runner.ts # Demo script orchestration
│   └── types.ts         # Shared type definitions
└── tests/
    ├── tts.test.ts      # TTS module tests (isolated)
    ├── muxing.test.ts   # Muxing module tests (isolated)
    ├── recorder.test.ts # Recorder module tests
    └── types.test.ts    # Type validation tests
```

### Module Boundaries

Each module must follow these rules:

#### ✅ Allowed
- Import from Node.js standard library (`node:fs`, `node:path`, etc.)
- Import shared `types.ts` for type definitions only
- Export all public functions and types
- Use environment variables for configuration
- Accept configuration via function parameters

#### ❌ Not Allowed
- Cross-module function calls (except `types.ts`)
- Shared internal state between modules
- Module initialization side effects
- Hardcoded configuration

#### ⚠️ Orchestration Layer Only
- `script-runner.ts` and `index.ts` are the **only** modules that import from other modules
- They act as the orchestration/composition layer
- All other modules must be completely independent

## Module Details

### TTS Module (`tts.ts`)

**Purpose:** Text-to-speech generation and voice cloning using MiniMax Speech API

**Extractability:** Can become `@vertz/tts` package or TTS microservice

**Dependencies:**
- Node.js: `fs/promises`, `path`
- External: MiniMax Speech API (via `fetch`)

**Configuration:**
- `MINIMAX_API_KEY` environment variable
- `TTSOptions` interface for per-call configuration

**Public API:**
```typescript
// Core TTS
generateTTS(text: string, outputPath: string, options?: TTSOptions): Promise<void>

// Voice cloning
cloneVoice(audioFilePath: string, voiceName: string): Promise<string>

// Utilities
getAudioDuration(audioPath: string): Promise<number>

// Types
interface TTSOptions { voiceId?, speed?, model?, format?, ... }
class MiniMaxTTSError extends Error { statusCode?, retryAfter? }
```

**Isolation:** Zero dependencies on other demo-toolkit modules

### Muxing Module (`muxing.ts`)

**Purpose:** Audio/video combination and timeline creation using FFmpeg

**Extractability:** Can become `@vertz/video-muxing` package or video processing microservice

**Dependencies:**
- Node.js: `fs/promises`, `child_process`, `util`
- External: FFmpeg system binary

**Configuration:**
- No environment variables (FFmpeg auto-detected)
- All options passed as function parameters

**Public API:**
```typescript
// FFmpeg availability
checkFFmpeg(): Promise<boolean>

// Video + audio muxing
combineVideoAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void>

// Multi-clip timeline
createAudioTimeline(clips: AudioClip[], duration: number, outputPath: string): Promise<void>

// Types
interface AudioClip { audioPath: string; timestamp: number }
```

**Isolation:** Zero dependencies on other demo-toolkit modules

### Recorder Module (`recorder.ts`)

**Purpose:** Automated browser demo recording using Playwright

**Extractability:** Can become `@vertz/demo-recorder` package

**Dependencies:**
- Node.js: `fs/promises`, `path`
- External: `@playwright/test`, `@vertz/core`

**Configuration:**
- All configuration via `DemoRecorder` constructor options
- No environment variables

**Public API:**
```typescript
class DemoRecorder {
  constructor(browser: Browser, outputDir: string)
  start(): Promise<void>
  stop(): Promise<string>
  captureScreenshot(name: string): Promise<string>
  // ... other methods
}
```

**Isolation:** Depends on `@vertz/core` for exceptions (could be extracted)

### Script Runner (`script-runner.ts`)

**Purpose:** Orchestration layer that combines TTS, recording, and muxing

**Extractability:** This is the **composition layer** - not meant to be extracted

**Dependencies:**
- Internal: `tts.ts`, `muxing.ts`, `recorder.ts`, `types.ts`
- External: `@vertz/core`

**Role:**
- Coordinates multiple modules to execute demo scripts
- The only module allowed to import from other demo-toolkit modules
- Contains the business logic for demo execution workflow

## Extraction Strategy

### Phase 1: Module Isolation (Current)
Each module is already self-contained but lives in the monorepo.

### Phase 2: Package Extraction
When a module needs to be extracted:

```bash
# Example: Extract TTS module
mkdir -p ../vertz-tts/src
cp packages/demo-toolkit/src/tts.ts ../vertz-tts/src/
cp packages/demo-toolkit/tests/tts.test.ts ../vertz-tts/tests/

# Create package.json
cat > ../vertz-tts/package.json <<EOF
{
  "name": "@vertz/tts",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {}
}
EOF
```

**No refactoring required** - the module is already self-contained!

### Phase 3: Microservice Conversion
When a module needs to become a service:

```typescript
// Example: TTS as HTTP service
import express from 'express';
import { generateTTS, cloneVoice } from './tts.js';

const app = express();

app.post('/v1/tts', async (req, res) => {
  const { text, options } = req.body;
  const outputPath = `/tmp/${uuid()}.mp3`;
  await generateTTS(text, outputPath, options);
  res.sendFile(outputPath);
});

app.post('/v1/voices/clone', async (req, res) => {
  const { audioPath, name } = req.body;
  const voiceId = await cloneVoice(audioPath, name);
  res.json({ voiceId });
});

app.listen(3000);
```

**Again, no module refactoring required** - just wrap in HTTP layer!

## Testing Strategy

### Isolated Module Tests
Each module has its own test file that mocks all external dependencies:

```typescript
// tts.test.ts - Mock fetch()
global.fetch = vi.fn();

// muxing.test.ts - Mock child_process.exec
vi.mock('node:child_process', () => ({ exec: vi.fn() }));

// recorder.test.ts - Mock Playwright browser
const mockBrowser = createMockBrowser();
```

**No integration tests between modules at the module level.** Integration happens in `script-runner.test.ts`.

### Integration Tests
Only `script-runner.ts` contains integration tests that verify modules work together correctly.

## Configuration Patterns

### Environment Variables
Use for **service-level configuration** that rarely changes:

```typescript
// Good: API keys, service URLs
const apiKey = process.env.MINIMAX_API_KEY;
const endpoint = process.env.MINIMAX_ENDPOINT || 'https://api.minimax.chat';
```

### Function Parameters
Use for **per-call configuration** that varies:

```typescript
// Good: Per-call options
await generateTTS(text, output, { 
  speed: 1.2,  // Varies per demo
  model: 'speech-02-hd'  // Varies per use case
});
```

### Constructor Options
Use for **instance configuration** when state is needed:

```typescript
// Good: Recorder instance configuration
const recorder = new DemoRecorder(browser, {
  outputDir: './demos',
  resolution: { width: 1920, height: 1080 }
});
```

## Anti-Patterns to Avoid

### ❌ Cross-Module Function Calls
```typescript
// BAD: tts.ts calling muxing.ts directly
import { combineVideoAudio } from './muxing.js';
export async function generateTTSAndMux() { ... }
```

**Solution:** Let `script-runner.ts` orchestrate:
```typescript
// GOOD: script-runner.ts orchestrates
import { generateTTS } from './tts.js';
import { combineVideoAudio } from './muxing.js';

await generateTTS(...);
await combineVideoAudio(...);
```

### ❌ Shared Mutable State
```typescript
// BAD: Shared global state
export const globalConfig = { apiKey: '...' };
```

**Solution:** Pass configuration explicitly:
```typescript
// GOOD: Explicit configuration
await generateTTS(text, output, { apiKey });
```

### ❌ Module Initialization Side Effects
```typescript
// BAD: Side effects on import
const client = new MinimaxClient(process.env.API_KEY);
```

**Solution:** Initialize on first use:
```typescript
// GOOD: Lazy initialization
function getApiKey(): string {
  const key = process.env.MINIMAX_API_KEY;
  if (!key) throw new Error('...');
  return key;
}
```

## Type Sharing

`types.ts` is the **only exception** to the "no cross-module imports" rule.

**Shared types should be:**
- Pure TypeScript interfaces/types (no runtime code)
- Used by multiple modules
- Stable (rarely change)

**Examples of good shared types:**
```typescript
// types.ts
export interface DemoScript { ... }
export interface DemoAction { ... }
export interface DemoResult { ... }
```

**When to keep types local:**
If a type is only used by one module, keep it in that module:
```typescript
// tts.ts
export interface TTSOptions { ... }  // Only used by TTS module
```

## Future Considerations

### Potential Extractions

**High Priority (Most Likely):**
1. `@vertz/tts` - TTS is a common need across many projects
2. `@vertz/video-muxing` - FFmpeg utilities are broadly useful

**Medium Priority:**
3. `@vertz/demo-recorder` - Playwright automation could be reused

**Low Priority (Keep in Monorepo):**
4. `script-runner` - Too specific to demo-toolkit's use case

### Service Architecture

If modules become microservices:

```
┌─────────────────┐
│  Demo Toolkit   │ (Orchestrator)
│  script-runner  │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    │         │          │          │
┌───▼───┐ ┌──▼──┐  ┌────▼────┐ ┌───▼────┐
│  TTS  │ │Muxing│  │Recorder│ │Storage │
│Service│ │Service│  │Service │ │Service │
└───────┘ └──────┘  └─────────┘ └────────┘
```

Each service would be independently deployable, scalable, and maintainable.

## Summary

**Key Principles:**
1. **Isolation** - Each module is self-contained
2. **Explicit** - Configuration via env vars or parameters, never implicit
3. **Testable** - All external dependencies mockable
4. **Extractable** - Can become a package or service with minimal changes
5. **Orchestration** - Only `script-runner.ts` combines modules

**Follow these principles and extraction becomes trivial!** 🚀
