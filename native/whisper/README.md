# whisper-addon

Native N-API addon for [whisper.cpp](https://github.com/ggerganov/whisper.cpp) with Metal GPU acceleration on Apple Silicon.

## Prerequisites

- macOS 13+ with Apple Silicon (M1/M2/M3)
- CMake 3.15+
- Xcode Command Line Tools (`xcode-select --install`)
- Node.js 18+

## Build

```bash
# Install dependencies
npm install

# Build the addon (Release mode with Metal GPU)
npm run build
```

## Usage

```typescript
import { WhisperModel } from './index';

// Load a model with Metal GPU enabled
const model = new WhisperModel('/path/to/ggml-base.bin', { gpu: true });

// Transcribe 16kHz mono Float32Array audio
const result = await model.transcribe(audioFloat32Array, { language: 'en' });

console.log(result.text);
console.log(result.segments); // [{ start: 0, end: 3000, text: "hello world" }]
console.log(result.processingTimeMs);

// Free resources when done
model.free();
```

## API

### `new WhisperModel(modelPath, options?)`

- `modelPath` — Path to a `.bin` ggml model file
- `options.gpu` — Enable Metal GPU (default: `true`)
- `options.nThreads` — Number of CPU threads (default: `4`)

### `model.transcribe(audio, options?)`

- `audio` — `Float32Array` of 16kHz mono PCM samples
- `options.language` — Language code (default: `'en'`, use `'auto'` for detection)
- Returns `Promise<TranscribeResult>`

### `model.free()`

Release native resources. The model instance can't be used after this.

## Architecture

```
CMakeLists.txt          → cmake-js build config
src/whisper_addon.cc    → C++ N-API binding (WhisperModel class + async transcription)
index.ts                → TypeScript wrapper
vendor/whisper.cpp/     → whisper.cpp source (git clone)
build/Release/          → Compiled .node binary (generated)
```
