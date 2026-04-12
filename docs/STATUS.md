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
| 1.8 Test mic + VAD on macOS                    | � Done | Debug UI (waveform, VAD indicator, level meter), pipeline IPC events       |

### Sprint 2: Speech-to-Text (whisper.cpp Native Addon)

| Task                                             | Status  | Notes               |
| ------------------------------------------------ | ------- | ------------------- |
| 2.1 Build whisper.cpp native N-API addon (Metal) | 🔴 TODO | node-gyp, M1 GPU    |
| 2.2 Model Manager (auto-download base model)     | 🔴 TODO | ggml format         |
| 2.3 Wire VAD → STT pipeline                      | 🔴 TODO | speech chunks       |
| 2.4 Interim vs final transcription               | 🔴 TODO |                     |
| 2.5 Pipeline Orchestrator (concurrent)           | 🔴 TODO | queue, backpressure |
| 2.6 Test STT latency on M1 (< 500ms/chunk)       | 🔴 TODO | after end-of-speech |
| 2.7 Adaptive model fallback (base → tiny)        | 🔴 TODO | P95 > 900ms trigger |

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

| Date       | Decision                                                 | Rationale                                                                                                                                                                                |
| ---------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-12 | Electron + React + TypeScript                            | Cross-platform, Web Audio API, mature native addon support                                                                                                                               |
| 2026-04-12 | **whisper.cpp as native N-API addon**                    | In-process (no IPC overhead), M1 Metal GPU, ~300-500ms                                                                                                                                   |
| 2026-04-12 | **@huggingface/transformers (ONNX)** for translation     | **Replaces Python sidecar** — no Python dependency, saves ~200MB RAM, zero IPC latency                                                                                                   |
| 2026-04-12 | **Silero VAD** (`@ricky0123/vad-web`)                    | Critical for latency — detects speech end, only sends speech to STT                                                                                                                      |
| 2026-04-12 | SQLite for local storage                                 | No backend needed, embedded, lightweight                                                                                                                                                 |
| 2026-04-12 | **Latency target redefined**                             | < 1s **after VAD detects end-of-speech** (not end-to-end from start of speech)                                                                                                           |
| 2026-04-12 | **Adaptive model quality**                               | Auto-downgrade whisper base → tiny if P95 > 900ms or RAM < 1.5GB                                                                                                                         |
| 2026-04-12 | Task 1.1: Tailwind v4 `@tailwindcss/vite` plugin         | Uses new v4 CSS-first config via `@import "tailwindcss"`, no tailwind.config.js needed                                                                                                   |
| 2026-04-12 | **Pipeline Orchestrator**                                | Concurrent processing: STT chunk N+1 while translating chunk N                                                                                                                           |
| 2026-04-12 | MVP: Mic-only capture                                    | Simple getUserMedia. System audio → Phase 2 backlog                                                                                                                                      |
| 2026-04-12 | **Realistic memory budget: ~1GB**                        | Electron ~450MB + whisper ~150MB + Opus-MT ONNX ~200MB + VAD ~30MB + overhead ~70MB                                                                                                      |
| 2026-04-12 | Task 1.4: AudioWorklet for mic capture                   | Not ScriptProcessorNode (deprecated). Buffer 4096 samples, IPC send via ArrayBuffer                                                                                                      |
| 2026-04-12 | Task 1.4: Mic permission via setPermissionRequestHandler | Grants 'media' permission. Entitlements updated for macOS hardened runtime                                                                                                               |
| 2026-04-12 | Task 1.5: Linear interpolation resampling                | Good enough for speech (whisper.cpp). No dependency needed. < 0.01ms per 4096 samples                                                                                                    |
| 2026-04-12 | Task 1.6: Direct onnxruntime-node + Silero VAD v5        | @ricky0123/vad-node deprecated Oct 2024 (removed from repo). Custom wrapper using Silero v5 ONNX model directly with onnxruntime-node (native, not WASM). Option B: VAD in main process. |
| 2026-04-12 | Task 1.7: Zustand for renderer state management          | Lightweight (< 1KB), no boilerplate, works well with React 19. Store holds selectedDeviceId + availableDevices with auto-fallback on unplug.                                             |
| 2026-04-12 | Task 1.8: Debug pipeline IPC via generic event channel   | Single 'pipeline:event' IPC channel for all debug events (vad:status, audio:level, speech:segment). Avoids IPC channel proliferation during debug phase.                                 |

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
