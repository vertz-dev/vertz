# @vertz/demo-toolkit

Automated demo recording toolkit for Vertz framework.

## Overview

Record polished, automated browser demos with:
- Scripted interactions (clicks, typing, navigation)
- Video recording via Playwright
- **Text-to-speech narration** synchronized with video
- Screenshots at key moments
- Realistic human-like timing
- Headless operation
- Audio/video muxing with FFmpeg

## Quick Start

```bash
# Install dependencies
bun install

# Record a demo
bun run record:task-manager
```

## Creating a Demo Script

```typescript
import type { DemoScript } from '@vertz/demo-toolkit';

export const myDemo: DemoScript = {
  id: 'my-demo',
  name: 'My Demo',
  description: 'Demonstrates feature X',
  startUrl: 'http://localhost:3000',
  outputPath: 'my-demo.webm',
  defaultDelay: {
    base: 800,
    variance: 0.3,
  },
  actions: [
    {
      type: 'narrate',
      text: 'Welcome to our application. Let me show you how it works.',
    },
    {
      type: 'navigate',
      url: '/dashboard',
    },
    {
      type: 'narrate',
      text: 'First, we\'ll add a new item.',
    },
    {
      type: 'click',
      selector: '.add-button',
      description: 'Open add dialog',
    },
    {
      type: 'type',
      selector: 'input[name="title"]',
      text: 'New Item',
    },
    {
      type: 'screenshot',
      options: {
        name: 'my-demo-01',
        annotation: 'Form filled',
      },
    },
  ],
};
```

## Action Types

### Navigate
```typescript
{
  type: 'navigate',
  url: '/path',
  waitFor: '.loaded-element' // optional
}
```

### Click
```typescript
{
  type: 'click',
  selector: '.button',
  description: 'Optional description'
}
```

### Type
```typescript
{
  type: 'type',
  selector: 'input',
  text: 'Text to type'
}
```

### Wait
```typescript
{
  type: 'wait',
  ms: 1000
}
```

### Screenshot
```typescript
{
  type: 'screenshot',
  options: {
    name: 'screenshot-name',
    annotation: 'Optional annotation'
  }
}
```

### Narrate
```typescript
{
  type: 'narrate',
  text: 'This is narration text that will be spoken over the video',
  description: 'Optional description'
}
```

### Custom
```typescript
{
  type: 'custom',
  fn: async (page) => {
    // Custom Playwright code
    await page.evaluate(() => console.log('Hello'));
  }
}
```

## Requirements

- **FFmpeg**: Required for audio/video muxing
  ```bash
  # Ubuntu/Debian
  apt-get install ffmpeg
  
  # macOS
  brew install ffmpeg
  ```

- **OpenClaw TTS**: The narration feature requires OpenClaw's TTS tool
  - Professional, warm voice (not robotic)
  - Automatically synchronized with video

## Configuration

```typescript
import { DemoRecorder } from '@vertz/demo-toolkit';

const recorder = new DemoRecorder({
  baseUrl: 'http://localhost:3000',
  headless: true,
  timeout: 30000,
  outputDir: 'demos',
  video: {
    format: 'webm',
    size: { width: 1280, height: 720 },
    fps: 30,
  },
});
```

## Output

- Videos: `demos/*.webm`
- Screenshots: `demos/*.png`

## Development

```bash
# Run tests
bun test

# Run tests in watch mode
bun test:watch

# Type check
bun typecheck
```

## Architecture

- `src/types.ts` - TypeScript definitions
- `src/recorder.ts` - Core Playwright wrapper
- `src/script-runner.ts` - Script execution engine
- `src/cli.ts` - Command-line interface
- `scripts/` - Demo scripts
- `demos/` - Output videos and screenshots
