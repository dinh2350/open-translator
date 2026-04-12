# Open Translator - Real-time Meeting Transcription & Translation

## 1. Project Overview

**Open Translator** là một desktop application giúp transcribe và translate real-time trong các cuộc meeting. Ứng dụng capture audio từ system (microphone + system audio), chuyển thành text (English), sau đó translate sang tiếng Việt và hiển thị song song trên 2 panel.

**Primary Use Case:** Meeting với clients ở US — cần hiểu rõ họ đang nói gì bằng cách xem transcript tiếng Anh và bản dịch tiếng Việt cùng lúc.

**Target Platform:** macOS (primary), Windows (future)

---

## 2. Features

### Phase 1 — Core (MVP)

| #   | Feature                             | Description                                                                                                            |
| --- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F1  | **Microphone Capture**              | Capture audio từ microphone input via Web Audio API. Đơn giản, không cần setup thêm                                    |
| F2  | **Real-time Speech-to-Text (STT)**  | Chuyển audio thành English transcript theo thời gian thực, hiển thị từng câu/đoạn khi nói xong                         |
| F3  | **Real-time Translation (EN → VI)** | Dịch mỗi đoạn transcript từ English sang Vietnamese ngay khi STT hoàn thành                                            |
| F4  | **Dual-panel UI**                   | Giao diện 2 cột song song: bên trái English transcript, bên phải Vietnamese translation. Auto-scroll theo nội dung mới |
| F5  | **Start/Stop Session**              | Button để bắt đầu và kết thúc session recording                                                                        |
| F6  | **Microphone Selection**            | Chọn microphone input device từ danh sách available devices                                                            |

### Phase 2 — Enhanced Experience

| #   | Feature                       | Description                                                                  |
| --- | ----------------------------- | ---------------------------------------------------------------------------- |
| F7  | **Speaker Diarization**       | Phân biệt người nói (Speaker 1, Speaker 2, ...) trong transcript             |
| F8  | **Export Transcript**         | Export toàn bộ transcript (EN + VI) ra file `.txt`, `.md`, hoặc `.docx`      |
| F9  | **Session History**           | Lưu lại các session trước đó, có thể mở lại xem                              |
| F10 | **Search in Transcript**      | Tìm kiếm keyword trong transcript hiện tại                                   |
| F11 | **Font Size & Theme**         | Điều chỉnh font size, dark/light mode                                        |
| F12 | **Bidirectional Translation** | Hỗ trợ cả VI → EN (khi mình nói tiếng Việt, dịch sang English)               |
| F13 | **System Audio Capture**      | Capture system audio (Zoom, Meet, Teams) via BlackHole hoặc ScreenCaptureKit |
| F14 | **Audio Source Mixer**        | Chọn và mix nhiều audio sources (mic + system audio)                         |

### Phase 3 — Advanced

| #   | Feature                    | Description                                                            |
| --- | -------------------------- | ---------------------------------------------------------------------- |
| F15 | **AI Meeting Summary**     | Tự động tóm tắt cuộc meeting sau khi kết thúc session                  |
| F16 | **Custom Vocabulary**      | Thêm thuật ngữ chuyên ngành (technical terms) để cải thiện accuracy    |
| F17 | **Hotkey Support**         | Global hotkeys để start/stop mà không cần focus vào app                |
| F18 | **Multi-language Support** | Mở rộng hỗ trợ nhiều ngôn ngữ khác ngoài EN-VI                         |
| F19 | **Floating Overlay Mode**  | Chế độ overlay nhỏ always-on-top hiển thị translation khi đang meeting |

---

## 3. Architecture Overview (Local-first, Self-hosted)

> **Design constraints:**
>
> - **Hardware**: MacBook M1 8GB RAM (unified memory, shared CPU/GPU)
> - **Latency**: < 1s from end-of-speech to translated text on screen
> - **Cost**: $0 — 100% offline, no cloud APIs
> - **Privacy**: Zero data leaves the machine

### 3.0 Latency Definition

**Important**: Latency < 1s is measured from **the moment VAD detects end-of-speech** to **translated text appearing on screen**. This is the correct metric because:

- User must finish speaking a sentence before it can be transcribed
- whisper.cpp is batch inference — it needs a complete audio chunk
- User expectation: see translation shortly after someone stops speaking

```
User speaks: "We need to deploy by Friday"
             ├──── speaking duration (not counted) ────┤
                                                        ▼ VAD detects silence
                                                        ├── THIS IS THE < 1s WINDOW ──┤
                                                        │ STT │ Translate │ Render │   │
                                                        │~400ms│  ~100ms  │ ~30ms  │   │
                                                        ├──────── ~530ms ──────────┤   │
                                                                             ✅ < 1s
```

### 3.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Desktop App (Electron)                        │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  Renderer Process (React UI)                  │ │
│  │                                                                │ │
│  │  ┌──────────────────────┐  ┌──────────────────────────┐      │ │
│  │  │  English Transcript   │  │  Vietnamese Translation  │      │ │
│  │  │  Panel (auto-scroll)  │  │  Panel (auto-scroll)     │      │ │
│  │  └──────────────────────┘  └──────────────────────────┘      │ │
│  │  ┌──────────────────────────────────────────────────────┐    │ │
│  │  │  [▶ Start] [⏹ Stop] [🎤 Mic ▼] [⚙ Settings]         │    │ │
│  │  └──────────────────────────────────────────────────────┘    │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                            ▲ IPC (events)                         │
│                            │                                       │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  Main Process (Node.js)                        │ │
│  │                                                                │ │
│  │  ┌─────────────┐   ┌──────────────────┐   ┌──────────────┐  │ │
│  │  │ Audio        │   │ STT Worker       │   │ Translation  │  │ │
│  │  │ Capture      │──▶│ (whisper.cpp     │──▶│ Worker       │  │ │
│  │  │ + VAD        │   │  native addon,   │   │ (transformers│  │ │
│  │  │              │   │  Metal GPU)      │   │  .js / ONNX) │  │ │
│  │  └─────────────┘   └──────────────────┘   └──────────────┘  │ │
│  │                                                                │ │
│  │  ┌─────────────┐   ┌──────────────────┐   ┌──────────────┐  │ │
│  │  │ Model        │   │ Pipeline         │   │ Session      │  │ │
│  │  │ Manager      │   │ Orchestrator     │   │ Storage      │  │ │
│  │  │ (download)   │   │ (concurrent)     │   │ (SQLite)     │  │ │
│  │  └─────────────┘   └──────────────────┘   └──────────────┘  │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Tech Stack (100% Local / Zero Dependencies)

| Layer                | Technology                                              | Rationale                                                  |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| **Desktop Shell**    | Electron v28+                                           | Cross-platform, Web Audio API, mature native addon support |
| **Frontend**         | React 18 + TypeScript + Tailwind CSS                    | Component-based UI, great DX                               |
| **Build Tool**       | Vite + electron-vite                                    | Fast HMR, optimized Electron builds                        |
| **Audio Capture**    | Web Audio API (`getUserMedia`)                          | Standard browser API, mic capture                          |
| **VAD**              | `@ricky0123/vad-web` (Silero VAD, ONNX)                 | Accurate speech detection, ~3MB model, runs in-process     |
| **Speech-to-Text**   | **whisper.cpp** via `whisper-addon` (native N-API)      | M1 Metal GPU, in-process, no IPC overhead                  |
| **Translation**      | **@huggingface/transformers** (Opus-MT, ONNX Runtime)   | Runs directly in Node.js — **no Python required**          |
| **Local Storage**    | SQLite via `better-sqlite3`                             | Embedded, synchronous, zero setup                          |
| **State Management** | Zustand                                                 | Lightweight, minimal boilerplate                           |
| **Model Manager**    | Custom download + cache in `~/.open-translator/models/` | Auto-download on first run                                 |

**Key change vs previous design**: Translation sử dụng `@huggingface/transformers` (ONNX Runtime) chạy trực tiếp trong Node.js — **loại bỏ hoàn toàn Python sidecar**. User không cần install Python, không có IPC overhead, tiết kiệm ~200MB RAM.

### 3.3 Latency Budget (Target: < 1s after end-of-speech)

```
┌──────────────────────────────────────────────────────────────────┐
│              REALISTIC Latency Budget (M1 8GB)                    │
├────────────────────────┬─────────────┬───────────────────────────┤
│ Stage                  │ Latency     │ Notes                     │
├────────────────────────┼─────────────┼───────────────────────────┤
│ VAD tail buffer        │ ~200ms      │ Detect end-of-speech      │
│                        │             │ (silence threshold)       │
│ whisper.cpp base       │ ~300-500ms  │ Metal GPU, N-API addon,   │
│ (native addon)         │             │ 2-3s audio chunk          │
│ Opus-MT translation    │ ~80-150ms   │ @huggingface/transformers │
│ (@huggingface/         │             │ ONNX Runtime, in-process  │
│  transformers)         │             │                           │
│ IPC + React render     │ ~20-30ms    │ Single IPC event +        │
│                        │             │ React state update        │
├────────────────────────┼─────────────┼───────────────────────────┤
│ TOTAL (after           │ ~600-880ms  │ ✅ Under 1s target       │
│  end-of-speech)        │             │                           │
├────────────────────────┼─────────────┼───────────────────────────┤
│ Worst case (long       │ ~950ms      │ ⚠️ At limit — fallback:  │
│  sentence + noise)     │             │ switch to whisper tiny    │
└────────────────────────┴─────────────┴───────────────────────────┘

Fallback strategy:
  If P95 latency > 900ms → auto-switch whisper base → tiny (~150-250ms)
  tiny model WER ~8% but still usable for meeting context
```

### 3.4 Memory Budget (MacBook M1 8GB — Realistic)

```
┌──────────────────────────────────────────────────────────────────┐
│               REALISTIC Memory Budget (M1 8GB)                    │
├──────────────────────────────────┬───────────────────────────────┤
│ Component                        │ RAM (realistic)               │
├──────────────────────────────────┼───────────────────────────────┤
│ Electron (Chromium + Node.js)    │ ~400-500 MB                   │
│ whisper.cpp base model (Metal)   │ ~150 MB                       │
│ Opus-MT ONNX model (in-process)  │ ~200 MB                       │
│ Silero VAD model                 │ ~30 MB                        │
│ SQLite + audio buffers           │ ~50 MB                        │
│ Node.js heap overhead            │ ~70 MB                        │
├──────────────────────────────────┼───────────────────────────────┤
│ App TOTAL                        │ ~900 MB — 1.0 GB              │
├──────────────────────────────────┼───────────────────────────────┤
│ macOS system                     │ ~3.0 GB                       │
│ Meeting app (Zoom/Meet/Teams)    │ ~500 MB — 1.0 GB              │
│ Other apps (browser, Slack)      │ ~1.0 — 2.0 GB                │
├──────────────────────────────────┼───────────────────────────────┤
│ TOTAL SYSTEM USAGE               │ ~5.4 — 7.0 GB                │
│ Headroom                         │ ~1.0 — 2.6 GB                │
│ Status                           │ ✅ Fits (M1 swap is fast)    │
└──────────────────────────────────┴───────────────────────────────┘

⚠️ Tight but viable. M1 unified memory + fast SSD swap handles bursts.
   If RAM pressure detected → switch whisper base → tiny (save ~75MB)
```

### 3.5 Whisper Model Selection Strategy

| Model     | Disk   | RAM     | Latency (3s audio) | WER   | When to use                        |
| --------- | ------ | ------- | ------------------ | ----- | ---------------------------------- |
| **tiny**  | 75 MB  | ~75 MB  | ~150-250ms         | ~8%   | RAM pressure fallback, noisy audio |
| **base**  | 142 MB | ~150 MB | ~300-500ms         | ~5%   | **Default — best balance**         |
| **small** | 466 MB | ~500 MB | ~600-900ms         | ~3.5% | Only on 16GB+ machines             |

**Auto-selection logic:**

1. Start with `base` model
2. Monitor latency P95 over last 10 chunks
3. If P95 > 900ms OR available RAM < 1.5GB → downgrade to `tiny`
4. If P95 < 300ms AND available RAM > 3GB → suggest upgrade to `small` in settings

### 3.6 Data Flow — Concurrent Pipeline

Previous design processed sequentially. New design uses **pipelining** so STT for chunk N+1 runs while translation for chunk N is in progress.

```
Timeline (concurrent pipeline):

Audio:    |==chunk 1==|==chunk 2==|==chunk 3==|
                      |                       |
VAD:           detect↓               detect↓  |
                      |                       |
STT:           |==STT 1==|    |==STT 2==|    |==STT 3==|
                          |              |              |
Translate:         |=TR 1=|       |=TR 2=|       |=TR 3=|
                          |              |              |
UI:                   [show1]        [show2]        [show3]

Result: After first sentence, each subsequent result appears
        ~500-800ms after end-of-speech (pipeline is warmed up)
```

**Detailed flow:**

```
Microphone
    │
    ▼
┌─────────────────────┐
│ Web Audio API        │  Continuous PCM stream (48kHz → resample 16kHz mono)
│ getUserMedia()       │
└──────────┬──────────┘
           │ Float32Array audio frames
           ▼
┌─────────────────────┐
│ Silero VAD           │  In-process (ONNX, ~3MB)
│ @ricky0123/vad-web   │  Detects speech start/end
└──────────┬──────────┘
           │ Speech segments (2-3s chunks)
           │
           ▼
┌─────────────────────┐
│ Pipeline             │  Orchestrates concurrent processing
│ Orchestrator         │  Manages queue, backpressure, fallback
└──────────┬──────────┘
           │
     ┌─────┴───────────────────┐
     │                         │ (pipeline: chunk N+1 STT
     ▼                         │  while chunk N translates)
┌──────────────┐               │
│ whisper.cpp   │  Native N-API addon
│ (Metal GPU)   │  base model: ~300-500ms
│               │  tiny fallback: ~150-250ms
└──────┬───────┘
       │ { text, timestamps, language }
       ▼
┌──────────────────┐
│ @huggingface/     │  ONNX Runtime (in-process Node.js)
│ transformers      │  Helsinki-NLP/opus-mt-en-vi
│ (Opus-MT)         │  ~80-150ms per sentence
└──────┬───────────┘
       │ { original, translated, timestamp }
       │
  ┌────┴────┐
  ▼         ▼
┌──────┐  ┌───────┐
│ IPC  │  │SQLite │  Async write (non-blocking)
│ emit │  │ save  │
└──┬───┘  └───────┘
   │
   ▼
┌──────────────────┐
│ React UI          │  Zustand store update → re-render
│ Dual-panel view   │  EN panel (left) + VI panel (right)
│ ~20ms render      │  Auto-scroll to latest
└──────────────────┘
```

### 3.7 Key Architecture Decisions

#### D1. whisper.cpp as Native N-API Addon (not child process)

```
                  Child Process          Native N-API Addon ✅
────────────────────────────────────────────────────────────
IPC overhead      ~50-100ms/call         0 (in-process)
Memory            +100MB (separate       Shared with Node.js
                   Node.js instance)
Complexity        Process lifecycle      Build step (node-gyp)
Crash isolation   ✅ Isolated            ❌ Can crash main
Metal GPU         ✅                     ✅
────────────────────────────────────────────────────────────
Decision: Native addon — latency is priority, crash risk
          mitigated by Electron's multi-process (main can restart)
```

#### D2. @huggingface/transformers replaces Python sidecar

```
                  Python Sidecar         transformers.js ✅
────────────────────────────────────────────────────────────
RAM overhead      +200MB (Python)        0 (same Node.js)
Latency overhead  +50-100ms (IPC)        0 (in-process call)
User dependency   Python 3.10+ ❌        None ✅
Packaging         Complex (bundle Py)    npm install ✅
Opus-MT support   ✅ CTranslate2         ✅ ONNX Runtime
M1 acceleration   ✅ (pip)               ✅ (onnxruntime)
────────────────────────────────────────────────────────────
Decision: transformers.js — eliminates Python dependency,
          reduces RAM by ~200MB, zero IPC latency
```

#### D3. Silero VAD — critical for latency budget

VAD is not optional — without it:

- whisper.cpp would process silence chunks → wasted ~400ms each
- No clear sentence boundaries → broken transcriptions
- CPU/GPU wasted on non-speech audio

Silero VAD via `@ricky0123/vad-web`:

- ~3MB ONNX model, runs in real-time
- Detects speech start/end with ~200ms accuracy
- Sends only speech segments to whisper → saves ~60% GPU time

#### D4. Electron — pragmatic choice for MVP

Tauri would save ~350MB RAM but:

- whisper.cpp Rust bindings (`whisper-rs`) less tested on M1 Metal
- transformers.js equivalent in Rust doesn't exist yet
- Electron's Web Audio API well-proven for audio capture
- Trade-off: ~350MB extra RAM acceptable on 8GB (M1 handles swap well)
- **Phase 3**: Evaluate Tauri migration if RAM becomes critical

#### D5. Pipeline Orchestrator — concurrent processing

Not just sequential STT → Translate → Render. The orchestrator:

1. Queues audio chunks from VAD
2. Starts STT immediately when chunk ready
3. Starts translation before next STT finishes (pipeline)
4. Handles backpressure: if STT is slower than audio, drops oldest pending chunk
5. Monitors latency P95 → triggers model downgrade if needed

#### D6. Adaptive Model Quality

```
              Normal Mode              Degraded Mode
───────────────────────────────────────────────────
Whisper       base (WER ~5%)           tiny (WER ~8%)
Trigger       default                  P95 > 900ms OR RAM < 1.5GB
Switch time   ~2s (reload model)       ~1s (smaller model)
Recovery      auto-upgrade when        check every 60s
              metrics improve
```

---

## 4. Implementation Plan

### Phase 1 — MVP (Target: 3-4 weeks)

#### Sprint 1: Project Setup & Audio Pipeline (Week 1)

| Task | Description                                                         | Priority |
| ---- | ------------------------------------------------------------------- | -------- |
| 1.1  | Init Electron + React + TypeScript + Vite project (`electron-vite`) | HIGH     |
| 1.2  | Setup project structure (main process, renderer, shared types)      | HIGH     |
| 1.3  | Setup ESLint, Prettier, build scripts                               | MEDIUM   |
| 1.4  | Implement microphone capture via Web Audio API (`getUserMedia`)     | HIGH     |
| 1.5  | Audio processing: resample 48kHz → 16kHz mono float32               | HIGH     |
| 1.6  | Integrate Silero VAD (`@ricky0123/vad-web`) for speech detection    | HIGH     |
| 1.7  | Microphone selector UI (dropdown of available devices)              | HIGH     |
| 1.8  | Test mic capture + VAD on macOS (permissions, speech detection)     | HIGH     |

#### Sprint 2: Speech-to-Text (whisper.cpp Native Addon) (Week 2)

| Task | Description                                                                  | Priority |
| ---- | ---------------------------------------------------------------------------- | -------- |
| 2.1  | Build whisper.cpp as native N-API addon with Metal GPU support               | HIGH     |
| 2.2  | Implement Model Manager — auto-download whisper `base` model (ggml)          | HIGH     |
| 2.3  | Wire VAD output → whisper STT pipeline (speech chunks → transcription)       | HIGH     |
| 2.4  | Handle interim (partial) vs final transcription results                      | HIGH     |
| 2.5  | Implement Pipeline Orchestrator — queue, backpressure, concurrent processing | HIGH     |
| 2.6  | Test STT latency on M1 (target < 500ms per chunk after end-of-speech)        | HIGH     |
| 2.7  | Implement adaptive model fallback (base → tiny if P95 > 900ms)               | MEDIUM   |

#### Sprint 3: Translation & Dual-Panel UI (Week 3)

| Task | Description                                                        | Priority |
| ---- | ------------------------------------------------------------------ | -------- |
| 3.1  | Integrate `@huggingface/transformers` + Opus-MT ONNX model (EN→VI) | HIGH     |
| 3.2  | Translation service abstraction layer                              | MEDIUM   |
| 3.3  | Build dual-panel UI layout (left EN, right VI)                     | HIGH     |
| 3.4  | Implement auto-scroll behavior                                     | HIGH     |
| 3.5  | Sync scrolling between 2 panels                                    | MEDIUM   |
| 3.6  | Display interim (partial) text với visual indicator                | MEDIUM   |
| 3.7  | Session start/stop controls                                        | HIGH     |

#### Sprint 4: Polish & Testing (Week 4)

| Task | Description                                                    | Priority |
| ---- | -------------------------------------------------------------- | -------- |
| 4.1  | Settings page (model selection, audio config, latency monitor) | HIGH     |
| 4.2  | Error handling, model loading states, graceful degradation     | HIGH     |
| 4.3  | Latency P95 indicator, memory usage display                    | MEDIUM   |
| 4.4  | Basic dark/light theme                                         | LOW      |
| 4.5  | End-to-end testing on macOS                                    | HIGH     |
| 4.6  | Package & build `.dmg` cho macOS                               | HIGH     |
| 4.7  | Write basic README & setup instructions                        | MEDIUM   |

### Phase 2 — Enhanced Experience (Week 5-8)

| Task | Description                                                               |
| ---- | ------------------------------------------------------------------------- |
| 5.1  | Speaker diarization (whisper.cpp has basic support via `--diarize`)       |
| 5.2  | Export transcript to `.txt` / `.md`                                       |
| 5.3  | Session history with SQLite storage                                       |
| 5.4  | Search in transcript                                                      |
| 5.5  | Font size controls                                                        |
| 5.6  | Bidirectional translation (VI → EN) using `opus-mt-vi-en` model           |
| 5.7  | Improved UI/UX polish                                                     |
| 5.8  | Ollama integration — optional higher-quality LLM translation (Qwen2.5-3B) |
| 5.9  | Whisper model switcher (tiny/base/small) in settings                      |
| 5.10 | **System Audio Capture** via BlackHole virtual driver                     |
| 5.11 | **ScreenCaptureKit** integration (macOS 13+, no BlackHole needed)         |
| 5.12 | Audio source mixer UI (mic + system audio)                                |

### Phase 3 — Advanced (Week 9-12)

| Task | Description                       |
| ---- | --------------------------------- |
| 6.1  | AI meeting summary (post-session) |
| 6.2  | Custom vocabulary/terminology     |
| 6.3  | Global hotkeys                    |
| 6.4  | Floating overlay mode             |
| 6.5  | Multi-language support            |

---

## 5. Project Structure

```
open-translator/
├── docs/
│   ├── PROJECT.md              # This file
│   └── STATUS.md               # Project status tracking
├── native/                     # Native addon (whisper.cpp)
│   ├── whisper/                 # whisper.cpp source + bindings
│   │   ├── binding.gyp         # node-gyp build config (Metal GPU)
│   │   ├── src/
│   │   │   └── whisper_addon.cc # N-API C++ bindings
│   │   └── index.ts            # TypeScript wrapper
│   └── README.md               # Build instructions
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts            # Main entry point
│   │   ├── audio/
│   │   │   ├── capture.ts      # Mic capture (getUserMedia wrapper)
│   │   │   └── processor.ts    # Resample 48kHz → 16kHz mono float32
│   │   ├── stt/
│   │   │   ├── types.ts        # STT interfaces
│   │   │   ├── whisper.ts      # whisper.cpp native addon wrapper
│   │   │   └── vad.ts          # Silero VAD integration
│   │   ├── translation/
│   │   │   ├── types.ts        # Translation interfaces
│   │   │   ├── opus-mt.ts      # @huggingface/transformers (ONNX)
│   │   │   └── ollama.ts       # Ollama LLM translation (Phase 2)
│   │   ├── pipeline/
│   │   │   ├── orchestrator.ts # Concurrent pipeline (VAD→STT→Translate)
│   │   │   ├── metrics.ts      # Latency P95 tracking, memory monitor
│   │   │   └── adaptive.ts     # Auto model downgrade/upgrade logic
│   │   ├── models/
│   │   │   ├── manager.ts      # Model download & cache manager
│   │   │   └── registry.ts     # Available models registry
│   │   ├── storage/
│   │   │   ├── database.ts     # SQLite setup
│   │   │   └── sessions.ts     # Session CRUD operations
│   │   └── ipc/
│   │       └── handlers.ts     # IPC event handlers
│   ├── renderer/               # React frontend
│   │   ├── index.html
│   │   ├── main.tsx            # React entry point
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── TranscriptPanel.tsx    # Single transcript panel
│   │   │   ├── DualPanelView.tsx      # Side-by-side layout
│   │   │   ├── ControlBar.tsx         # Start/Stop/Settings controls
│   │   │   ├── AudioSourceSelector.tsx
│   │   │   ├── StatusIndicator.tsx    # Model loaded / latency P95 / recording
│   │   │   ├── ModelDownloader.tsx    # First-run model download progress
│   │   │   └── SettingsDialog.tsx     # Model selection, audio config
│   │   ├── stores/
│   │   │   ├── transcriptStore.ts     # Zustand store for transcript
│   │   │   └── settingsStore.ts       # App settings
│   │   └── styles/
│   │       └── globals.css
│   └── shared/                 # Shared types between main & renderer
│       └── types.ts
├── resources/                  # App icons, assets
├── electron-builder.yml        # Build configuration
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## 6. Cost & Resource Estimation

### Cost per meeting: $0.00 (100% local)

| Resource                    | Cloud (old plan)       | Local (new plan)     |
| --------------------------- | ---------------------- | -------------------- |
| Speech-to-Text              | $0.26/hr (Deepgram)    | **$0** (whisper.cpp) |
| Translation                 | $0.01-0.05/hr (OpenAI) | **$0** (Opus-MT)     |
| **Total per hour**          | **~$0.30**             | **$0.00**            |
| Monthly (20 meetings × 1hr) | ~$6.00                 | **$0.00**            |

### One-time Model Downloads

| Model                | Size        | Purpose                         |
| -------------------- | ----------- | ------------------------------- |
| whisper-base (ggml)  | ~142 MB     | Speech-to-Text                  |
| whisper-tiny (ggml)  | ~75 MB      | STT fallback (auto-downloaded)  |
| Silero VAD (ONNX)    | ~3 MB       | Voice Activity Detection        |
| opus-mt-en-vi (ONNX) | ~200 MB     | EN → VI Translation             |
| opus-mt-vi-en (ONNX) | ~200 MB     | VI → EN Translation (Phase 2)   |
| **Total MVP**        | **~420 MB** | Downloaded once, cached locally |

### Hardware Requirements

| Spec    | Minimum         | Recommended    |
| ------- | --------------- | -------------- |
| CPU/GPU | Apple M1        | Apple M1 Pro+  |
| RAM     | 8 GB            | 16 GB          |
| Disk    | 1 GB free       | 2 GB free      |
| macOS   | 13.0+ (Ventura) | 14.0+ (Sonoma) |

---

## 7. macOS Audio Capture Notes

### MVP: Microphone Only

MVP chỉ capture **microphone input** qua `navigator.mediaDevices.getUserMedia()`. Đơn giản, không cần driver hay setup thêm. User chỉ cần grant Microphone permission lần đầu.

**Tip cho user**: Trong meeting (Zoom/Meet), bật speaker volume lớn → mic sẽ capture cả tiếng client nói qua loa. Không lý tưởng nhưng workable cho MVP.

### Backlog: System Audio Capture (Phase 2)

macOS không cho phép capture system audio trực tiếp. Các giải pháp sẽ implement trong Phase 2:

1. **BlackHole** (Phase 2 — đơn giản hơn): Virtual audio driver miễn phí, route system audio vào virtual input
2. **ScreenCaptureKit** (Phase 2 — tốt nhất): macOS 13+ native API, không cần driver bên ngoài
3. **Electron `desktopCapturer`** (backup): Capture tab/window audio (limited)

---

## 8. Security & Privacy

- **100% offline** — không có data nào rời khỏi máy user
- Không cần API keys, không cần account, không cần Python
- Audio chỉ được process local bởi whisper.cpp (native addon) → không gửi đi đâu
- Translation chạy local bởi @huggingface/transformers (ONNX) → không gửi đi đâu
- Transcript data lưu local (SQLite) trên máy user
- Không collect bất kỳ user data nào
- Không có telemetry, analytics, hay tracking
- Meeting content hoàn toàn private — critical cho business meetings

---

## 9. Key Libraries & Dependencies

| Package                            | Purpose                    | Notes                                            |
| ---------------------------------- | -------------------------- | ------------------------------------------------ |
| `whisper.cpp` (native N-API addon) | Speech-to-Text             | Custom build với Metal GPU, bundled in `native/` |
| `@huggingface/transformers`        | Translation (Opus-MT ONNX) | Runs in Node.js, no Python needed                |
| `@ricky0123/vad-web`               | Voice Activity Detection   | Silero VAD, ONNX, ~3MB model                     |
| `onnxruntime-node`                 | ONNX Runtime for Node.js   | Backend for transformers.js + VAD                |
| `electron` v28+                    | Desktop shell              | Chromium + Node.js                               |
| `electron-vite`                    | Build tool                 | Vite-based Electron builder                      |
| `better-sqlite3`                   | SQLite                     | Session storage, sync API                        |
| `zustand`                          | State management           | Lightweight React store                          |

> **Note**: Không có Python dependency. Tất cả AI models chạy trong Node.js process (whisper.cpp qua native addon, Opus-MT qua ONNX Runtime). User chỉ cần download app và chạy.
