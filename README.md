# Open Translator

Real-time English → Vietnamese meeting transcription & translation.
**100% local, 100% free.** No cloud APIs, no Python — everything runs on your Mac.

## Features

- **Real-time speech-to-text** — whisper.cpp with Metal GPU acceleration
- **Instant translation** — Opus-MT (ONNX) English → Vietnamese
- **Voice activity detection** — Silero VAD, only processes speech
- **Dual-panel UI** — English transcript + Vietnamese translation side-by-side
- **Adaptive quality** — auto-downgrades model if latency spikes
- **Dark/Light/System theme** — follows macOS appearance by default
- **Settings** — model selection, font size, audio device
- **Latency dashboard** — real-time P95 metrics in the status bar

## Quick Start

1. Download `open-translator-0.1.0.dmg` from [Releases](https://github.com/open-translator/open-translator/releases)
2. Drag to Applications → Open → Grant microphone permission
3. Click **▶ Start** → speak English → see transcript + translation

Models (~300 MB) download automatically on first launch.

## Performance

Measured on Apple M4 with Metal GPU:

| Metric | Result | Target |
|--------|--------|--------|
| STT P95 (tiny.en, 3s audio) | 40 ms | < 250 ms |
| STT P95 (base.en, 3s audio) | 70 ms | < 500 ms |
| Translation P95 | 61 ms | < 150 ms |
| End-to-end P95 | 186 ms | < 1000 ms |
| Memory (steady-state) | ~2 GB | — |

## Development Setup

### Prerequisites

- **macOS** with Apple Silicon (M1/M2/M3/M4)
- **Node.js** 18+ (`brew install node`)
- **Xcode Command Line Tools** (`xcode-select --install`)
- **CMake** (`brew install cmake`)

### Install & Run

```bash
# Clone and install dependencies
git clone https://github.com/open-translator/open-translator.git
cd open-translator
npm install

# Build the native whisper.cpp addon (requires CMake)
cd native/whisper
npm run build
cd ../..

# Start development server
npm run dev
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Electron app in dev mode with HMR |
| `npm run build` | Typecheck + build for production |
| `npm run build:mac` | Build .dmg installer (arm64) |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm test` | Run vitest tests |
| `npx tsx scripts/e2e-pipeline.ts` | Full E2E hardware benchmark |

### Project Structure

```
src/
  main/           # Electron main process
    audio/        # Audio processing & resampling
    ipc/          # IPC handler registration
    models/       # Model download & management
    pipeline/     # Orchestrator, metrics, adaptive quality
    stt/          # whisper.cpp wrapper, Silero VAD
    translation/  # Opus-MT translator, types
    storage/      # Settings persistence
  preload/        # Context bridge (renderer ↔ main)
  renderer/       # React UI
    components/   # ControlBar, TranscriptPanel, SettingsDialog, etc.
    stores/       # Zustand state (transcript, settings)
    hooks/        # IPC listeners
    audio/        # AudioWorklet mic capture
  shared/         # Shared types (IPC channels, interfaces)
native/
  whisper/        # C++ N-API addon for whisper.cpp (Metal GPU)
resources/
  models/         # Silero VAD ONNX models
docs/
  PROJECT.md      # Architecture & design decisions
  TASKS.md        # Sprint task specs
  STATUS.md       # Completion status
```

### Architecture

```
Mic (renderer) → IPC → Resample → VAD → STT → Translate → IPC → UI
     AudioWorklet     16kHz mono   Silero  whisper.cpp  Opus-MT    React
```

All ML inference runs locally:
- **whisper.cpp** — N-API native addon with Metal GPU, Flash Attention
- **Opus-MT** — @huggingface/transformers with onnxruntime-node
- **Silero VAD** — ONNX model via onnxruntime-node

See [docs/PROJECT.md](docs/PROJECT.md) for detailed architecture.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 39 + electron-vite 5 |
| UI | React 19 + TypeScript 5.9 |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| STT | whisper.cpp (C++ N-API, Metal GPU) |
| Translation | Opus-MT via @huggingface/transformers 4 |
| VAD | Silero VAD v5 via onnxruntime-node |
| Tests | Vitest 4 |

## License

MIT
