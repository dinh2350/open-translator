# Open Translator — Project Status

> Last updated: 2026-04-12

## Overall Progress

| Phase              | Status         | Progress |
| ------------------ | -------------- | -------- |
| Phase 1 — MVP      | In Progress    | 12%      |
| Phase 2 — Enhanced | 🔴 Not Started | 0%       |
| Phase 3 — Advanced | 🔴 Not Started | 0%       |

---

## Phase 1 — MVP Detail

### Sprint 1: Project Setup & Audio Pipeline

| Task                                           | Status  | Notes                                                                      |
| ---------------------------------------------- | ------- | -------------------------------------------------------------------------- |
| 1.1 Init Electron + React + TS + electron-vite | � Done  | Electron v39, electron-vite v5, Tailwind v4, strict TS                     |
| 1.2 Project structure setup                    | 🟢 Done | types.ts, barrel exports, IPC placeholder, path aliases                    |
| 1.3 ESLint, Prettier, build scripts            | � Done  | ESLint 9 flat config, .prettierrc (single quotes, 100w), lint:fix added    |
| 1.4 Microphone capture (Web Audio API)         | � Done  | AudioWorklet + IPC bridge, permission handler, CSP updated                 |
| 1.5 Audio resample 48kHz → 16kHz mono float32  | � Done  | AudioProcessor class, linear interpolation, noise gate, 9 unit tests       |
| 1.6 Silero VAD integration                     | � Done  | Custom onnxruntime-node wrapper (vad-node deprecated), AudioPipeline wired |
| 1.7 Microphone selector UI                     | 🟢 Done | Zustand store + AudioSourceSelector dropdown, hot-plug support             |
| 1.8 Test mic + VAD on macOS                    | � Done  | Debug UI (waveform, VAD indicator, level meter), pipeline IPC events       |

### Sprint 2: Speech-to-Text (whisper.cpp Native Addon)

| Task                                             | Status  | Notes                                |
| ------------------------------------------------ | ------- | ------------------------------------ |
| 2.1 Build whisper.cpp native N-API addon (Metal) | � Done  | cmake-js + Metal GPU, 80ms/11s audio |
| 2.2 Model Manager (auto-download base model)     | � Done | Registry + download + SHA256 + resume + IPC |
| 2.3 Wire VAD → STT pipeline                      | � Done | WhisperSTT class + pipeline wiring, 93ms/11s |
| 2.4 Interim vs final transcription               | � Done | Timer-based interim (Option A), pendingId grouping |
| 2.5 Pipeline Orchestrator (concurrent)           | � Done | FIFO queue, backpressure (max 5), concurrent STT‖Translate |
| 2.6 Test STT latency on M1 (< 500ms/chunk)       | � Done | base P95=69ms, tiny P95=37ms, Metal 2.9x CPU |
| 2.7 Adaptive model fallback (base → tiny)        | � Done | AdaptiveModelQuality, P95>900ms or RAM<1.5GB triggers |

### Sprint 3: Translation & UI

| Task                                         | Status  | Notes      |
| -------------------------------------------- | ------- | ---------- |
| 3.1 @huggingface/transformers + Opus-MT ONNX | 🔴 TODO | no Python! |
| 3.2 Translation service abstraction          | 🔴 TODO |            |
| 3.3 Dual-panel UI layout                     | 🔴 TODO |            |
| 3.4 Auto-scroll behavior                     | 🔴 TODO |            |
| 3.5 Sync scrolling between panels            | 🔴 TODO |            |
| 3.6 Interim text visual indicator            | 🔴 TODO |            |
| 3.7 Session start/stop controls              | 🔴 TODO |            |

### Sprint 4: Polish & Testing

| Task                                      | Status  | Notes |
| ----------------------------------------- | ------- | ----- |
| 4.1 Settings page (model, audio, latency) | 🔴 TODO |       |
| 4.2 Error handling & graceful degradation | 🔴 TODO |       |
| 4.3 Latency P95 indicator, memory display | 🔴 TODO |       |
| 4.4 Dark/light theme                      | 🔴 TODO |       |
| 4.5 E2E testing on macOS M1 8GB           | 🔴 TODO |       |
| 4.6 Package .dmg for macOS                | 🔴 TODO |       |
| 4.7 README & setup docs                   | 🔴 TODO |       |

---

## Phase 2 — Enhanced Experience

| Task                                    | Status  | Notes              |
| --------------------------------------- | ------- | ------------------ |
| 5.1 Speaker diarization                 | 🔴 TODO |                    |
| 5.2 Export transcript (.txt/.md)        | 🔴 TODO |                    |
| 5.3 Session history (SQLite)            | 🔴 TODO |                    |
| 5.4 Search in transcript                | 🔴 TODO |                    |
| 5.5 Font size controls                  | 🔴 TODO |                    |
| 5.6 Bidirectional translation (VI → EN) | 🔴 TODO | opus-mt-vi-en ONNX |
| 5.7 UI/UX polish                        | 🔴 TODO |                    |
| 5.8 Ollama LLM translation option       | 🔴 TODO | Qwen2.5-3B         |
| 5.9 Whisper model switcher              | 🔴 TODO | tiny/base/small    |
| 5.10 System audio capture (BlackHole)   | 🔴 TODO | virtual driver     |
| 5.11 ScreenCaptureKit integration       | 🔴 TODO | macOS 13+ native   |
| 5.12 Audio source mixer UI              | 🔴 TODO | mic + system       |

---

## Phase 3 — Advanced

| Task                         | Status  | Notes           |
| ---------------------------- | ------- | --------------- |
| 6.1 AI meeting summary       | 🔴 TODO |                 |
| 6.2 Custom vocabulary        | 🔴 TODO |                 |
| 6.3 Global hotkeys           | 🔴 TODO |                 |
| 6.4 Floating overlay mode    | 🔴 TODO |                 |
| 6.5 Multi-language support   | 🔴 TODO |                 |
| 6.6 Evaluate Tauri migration | 🔴 TODO | save ~350MB RAM |

---

## Decisions Log

| Date       | Decision                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-12 | Electron + React + TypeScript                            | Cross-platform, Web Audio API, mature native addon support                                                                                                                                                                                                                                                                                                  |
| 2026-04-12 | **whisper.cpp as native N-API addon**                    | In-process (no IPC overhead), M1 Metal GPU, ~300-500ms                                                                                                                                                                                                                                                                                                      |
| 2026-04-12 | **@huggingface/transformers (ONNX)** for translation     | **Replaces Python sidecar** — no Python dependency, saves ~200MB RAM, zero IPC latency                                                                                                                                                                                                                                                                      |
| 2026-04-12 | **Silero VAD** (`@ricky0123/vad-web`)                    | Critical for latency — detects speech end, only sends speech to STT                                                                                                                                                                                                                                                                                         |
| 2026-04-12 | SQLite for local storage                                 | No backend needed, embedded, lightweight                                                                                                                                                                                                                                                                                                                    |
| 2026-04-12 | **Latency target redefined**                             | < 1s **after VAD detects end-of-speech** (not end-to-end from start of speech)                                                                                                                                                                                                                                                                              |
| 2026-04-12 | **Adaptive model quality**                               | Auto-downgrade whisper base → tiny if P95 > 900ms or RAM < 1.5GB                                                                                                                                                                                                                                                                                            |
| 2026-04-12 | Task 1.1: Tailwind v4 `@tailwindcss/vite` plugin         | Uses new v4 CSS-first config via `@import "tailwindcss"`, no tailwind.config.js needed                                                                                                                                                                                                                                                                      |
| 2026-04-12 | **Pipeline Orchestrator**                                | Concurrent processing: STT chunk N+1 while translating chunk N                                                                                                                                                                                                                                                                                              |
| 2026-04-12 | MVP: Mic-only capture                                    | Simple getUserMedia. System audio → Phase 2 backlog                                                                                                                                                                                                                                                                                                         |
| 2026-04-12 | **Realistic memory budget: ~1GB**                        | Electron ~450MB + whisper ~150MB + Opus-MT ONNX ~200MB + VAD ~30MB + overhead ~70MB                                                                                                                                                                                                                                                                         |
| 2026-04-12 | Task 1.4: AudioWorklet for mic capture                   | Not ScriptProcessorNode (deprecated). Buffer 4096 samples, IPC send via ArrayBuffer                                                                                                                                                                                                                                                                         |
| 2026-04-12 | Task 1.4: Mic permission via setPermissionRequestHandler | Grants 'media' permission. Entitlements updated for macOS hardened runtime                                                                                                                                                                                                                                                                                  |
| 2026-04-12 | Task 1.5: Linear interpolation resampling                | Good enough for speech (whisper.cpp). No dependency needed. < 0.01ms per 4096 samples                                                                                                                                                                                                                                                                       |
| 2026-04-12 | Task 1.6: Direct onnxruntime-node + Silero VAD v5        | @ricky0123/vad-node deprecated Oct 2024 (removed from repo). Custom wrapper using Silero v5 ONNX model directly with onnxruntime-node (native, not WASM). Option B: VAD in main process.                                                                                                                                                                    |
| 2026-04-12 | Task 1.7: Zustand for renderer state management          | Lightweight (< 1KB), no boilerplate, works well with React 19. Store holds selectedDeviceId + availableDevices with auto-fallback on unplug.                                                                                                                                                                                                                |
| 2026-04-12 | Task 1.8: Debug pipeline IPC via generic event channel   | Single 'pipeline:event' IPC channel for all debug events (vad:status, audio:level, speech:segment). Avoids IPC channel proliferation during debug phase.                                                                                                                                                                                                    |
| 2026-04-12 | Task 2.1: cmake-js instead of node-gyp for whisper.cpp   | whisper.cpp is a CMake project — using cmake-js with add_subdirectory avoids listing 50+ source files in binding.gyp. No suitable npm bindings exist (whisper-node shells out to CLI, whisper.cpp npm is WASM, whisper-addon is 3yr-old demo). Custom N-API addon with Metal GPU, Flash Attention, async transcription. 80ms for 11s JFK audio on Apple M4. |
| 2026-04-12 | Task 2.2: Node.js built-in https for model downloads     | No external HTTP library needed. Node's https module + Range headers for resume, crypto.createHash for SHA256, atomic temp-file rename. Registry stores URLs + sizes + hashes for whisper ggml models (tiny/base/small, en variants). ModelManager singleton shared via IPC handlers — future tasks (2.3+) can call getModelManager(). |
| 2026-04-12 | Task 2.3: WhisperSTT wrapper with edge-case guards       | WhisperSTT wraps native addon + ModelManager. Skips short segments (< 0.5s / 8000 samples) and empty transcriptions. Warns on long segments (> 30s). Uses tiny.en by default for fast startup (76ms load, 93ms for 11s JFK). `switchModel()` ready for Task 2.7 adaptive fallback. Transcript events sent via existing `pipeline:event` IPC channel. |
| 2026-04-12 | Task 2.4: Option A — timer-based interim transcription    | VAD emits accumulated audio every ~1s via `onSpeechActive` callback. WhisperSTT.transcribe() accepts `isFinal` + `pendingId` options. Interim skipped if STT already busy (debounce). `pendingId` (UUID) groups interim + final segments for same utterance — UI replaces interims when final arrives. Added `interimIntervalMs` to VADOptions (default 1000ms). |
| 2026-04-12 | Task 2.5: PipelineOrchestrator with concurrent STT‖Translate | Central orchestrator manages FIFO queue (max 5, backpressure drops oldest). STT(N+1) runs concurrently with Translate(N) via Promise chaining. MetricsTracker tracks P95 latency (rolling window of 20) + memory via `process.memoryUsage()`. Emits typed `segment`, `metrics`, `status` events. StubTranslator placeholder for Sprint 3. index.ts refactored to delegate all STT/interim logic to orchestrator. |
| 2026-04-12 | Task 2.6: STT latency benchmarked on Apple M4     | base.en P95=69ms (7.2x margin vs 500ms target), tiny.en P95=37ms (6.7x margin vs 250ms target). Metal GPU 2.9x faster than CPU. Fixed whisper-base.en SHA256 in registry (HuggingFace file updated). Performance exceeds targets so much that base.en could be default model for better accuracy. |
| 2026-04-12 | Task 2.7: Adaptive downgrade immediate, upgrade suggestion only | AdaptiveModelQuality evaluates after each pipeline cycle. Downgrade base→tiny is immediate when P95 total >900ms or freemem <1.5GB. Upgrade tiny→base is only suggested (checked every 60s, requires P95 <300ms + RAM >3GB). Orchestrator pauses queue during model switch, resumes after. `model:switched` event forwarded to renderer. No chunks lost — queue preserved during switch. |

---

## Blockers & Risks

| Risk                                            | Impact | Mitigation                                                |
| ----------------------------------------------- | ------ | --------------------------------------------------------- |
| macOS system audio capture complexity           | HIGH   | MVP: mic-only. Phase 2: BlackHole / ScreenCaptureKit      |
| whisper.cpp native addon build complexity       | HIGH   | Prebuild binaries for M1, fallback to whisper-node        |
| Worst-case latency > 1s (long sentence + noise) | MEDIUM | Adaptive: auto-switch base → tiny model (~150ms)          |
| Opus-MT translation quality for technical terms | MEDIUM | Phase 2: Ollama + LLM for context-aware translation       |
| Memory pressure with Zoom + app running         | MEDIUM | Monitor RAM, adaptive model downgrade, M1 swap is fast    |
| First-run model download (~420MB)               | LOW    | Show progress bar, cache permanently, resume on failure   |
| @huggingface/transformers ONNX perf on M1       | MEDIUM | Benchmark early in Sprint 3; fallback: CTranslate2 native |
