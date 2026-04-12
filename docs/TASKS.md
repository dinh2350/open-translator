# Open Translator — Implementation Tasks

> Detailed, actionable tasks for developers. Each task includes technical specs, acceptance criteria, dependencies, and estimated files.
>
> **Core Language**: Node.js + TypeScript
> **Runtime**: Electron (main + renderer process)
> **No Python dependency**

---

## Sprint 1: Project Setup & Audio Pipeline (Week 1)

---

### Task 1.1 — Init Electron + React + TypeScript + electron-vite

**Priority**: HIGH | **Depends on**: None | **Estimate**: 2-3 hours

**Description**: Scaffold the Electron project using `electron-vite` with React + TypeScript template. Configure for macOS M1 native addon support.

**Steps**:

1. Run `npm create @quick-start/electron open-translator -- --template react-ts`
2. Verify Electron v28+ in `package.json`
3. Configure `electron-vite` in `electron.vite.config.ts`:
   - Main process: target `node18`, external `better-sqlite3` and native addons
   - Renderer: React + Tailwind CSS
   - Preload: standard config
4. Add Tailwind CSS: `npm install -D tailwindcss @tailwindcss/vite`
5. Configure `tailwind.config.js` with content paths
6. Add dev scripts: `dev`, `build`, `start`, `lint`
7. Verify `npm run dev` launches Electron with hot-reload working

**Files to create/modify**:

- `package.json` — dependencies, scripts
- `electron.vite.config.ts` — Vite config for Electron
- `tailwind.config.js` — Tailwind config
- `src/renderer/styles/globals.css` — Tailwind directives (`@tailwind base/components/utilities`)
- `tsconfig.json`, `tsconfig.node.json` — TypeScript configs

**Acceptance Criteria**:

- [ ] `npm run dev` opens Electron window with React + Tailwind "Hello World"
- [ ] Hot-reload works for renderer changes
- [ ] Main process restarts on changes
- [ ] TypeScript strict mode enabled
- [ ] Builds for macOS ARM64 (`npm run build`)

---

### Task 1.2 — Setup Project Structure

**Priority**: HIGH | **Depends on**: 1.1 | **Estimate**: 1-2 hours

**Description**: Create the directory structure and shared type definitions matching the architecture.

**Steps**:

1. Create directory tree:
   ```
   native/whisper/src/        # N-API addon (Sprint 2)
   src/main/audio/
   src/main/stt/
   src/main/translation/
   src/main/pipeline/
   src/main/models/
   src/main/storage/
   src/main/ipc/
   src/renderer/components/
   src/renderer/stores/
   src/renderer/styles/
   src/shared/
   resources/
   ```
2. Create `src/shared/types.ts` with core interfaces:

   ```typescript
   export interface TranscriptSegment {
     id: string;
     text: string; // Original English text
     translated?: string; // Vietnamese translation
     timestamp: number; // Unix ms
     isFinal: boolean; // false = interim/partial
     speakerId?: string; // Phase 2
     audioDurationMs: number; // Duration of source audio chunk
     sttLatencyMs: number; // whisper processing time
     translationLatencyMs?: number; // Opus-MT processing time
     totalLatencyMs: number; // End-of-speech → text on screen
   }

   export interface AudioChunk {
     samples: Float32Array; // 16kHz mono float32
     sampleRate: number; // 16000
     timestamp: number; // When VAD detected end-of-speech
   }

   export interface PipelineMetrics {
     sttP95Ms: number;
     translationP95Ms: number;
     totalP95Ms: number;
     memoryUsageMB: number;
     activeModel: 'tiny' | 'base' | 'small';
     chunksProcessed: number;
     chunksDropped: number;
   }

   export interface AppSettings {
     audioDeviceId: string | null;
     whisperModel: 'tiny' | 'base' | 'small';
     autoModelSwitch: boolean;
     language: { source: string; target: string };
     ui: { theme: 'light' | 'dark'; fontSize: number };
   }

   export type IPCEvents = {
     'transcript:segment': TranscriptSegment;
     'pipeline:metrics': PipelineMetrics;
     'pipeline:status': 'idle' | 'recording' | 'processing' | 'error';
     'model:download-progress': {
       model: string;
       percent: number;
       bytesDownloaded: number;
       bytesTotal: number;
     };
     'model:ready': { model: string };
     'audio:devices': MediaDeviceInfo[];
   };
   ```

3. Create placeholder `index.ts` barrel exports in each directory
4. Setup path aliases in `tsconfig.json`:
   ```json
   { "paths": { "@shared/*": ["./src/shared/*"], "@main/*": ["./src/main/*"] } }
   ```

**Files to create**:

- `src/shared/types.ts` — Core type definitions
- `src/main/ipc/handlers.ts` — IPC handler registration (placeholder)
- Directory structure with `.gitkeep` or barrel files

**Acceptance Criteria**:

- [ ] All directories exist
- [ ] `src/shared/types.ts` compiles without errors
- [ ] Path aliases resolve correctly in both main and renderer
- [ ] `npm run build` succeeds

---

### Task 1.3 — Setup ESLint, Prettier, Build Scripts

**Priority**: MEDIUM | **Depends on**: 1.1 | **Estimate**: 1 hour

**Steps**:

1. Install: `npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser prettier eslint-config-prettier`
2. Create `.eslintrc.json`:
   - Extends: `@typescript-eslint/recommended`, `prettier`
   - Rules: `no-unused-vars: warn`, `@typescript-eslint/explicit-function-return-type: off`
   - Ignore: `native/`, `dist/`, `out/`
3. Create `.prettierrc`: `{ "semi": true, "singleQuote": true, "trailingComma": "es5", "printWidth": 100 }`
4. Add scripts to `package.json`:
   ```json
   "lint": "eslint src/ --ext .ts,.tsx",
   "lint:fix": "eslint src/ --ext .ts,.tsx --fix",
   "format": "prettier --write src/",
   "typecheck": "tsc --noEmit"
   ```
5. Create `.gitignore` with: `node_modules/`, `dist/`, `out/`, `*.dmg`, `native/whisper/build/`, `models/`

**Acceptance Criteria**:

- [ ] `npm run lint` runs without config errors
- [ ] `npm run format` formats all files
- [ ] `npm run typecheck` passes

---

### Task 1.4 — Implement Microphone Capture via Web Audio API

**Priority**: HIGH | **Depends on**: 1.2 | **Estimate**: 3-4 hours

**Description**: Capture audio from microphone in the **renderer process** using Web Audio API, then send raw PCM data to main process via IPC.

**Steps**:

1. Create `src/renderer/audio/capture.ts`:
   ```typescript
   // Key API: navigator.mediaDevices.getUserMedia({ audio: { deviceId, sampleRate: 48000, channelCount: 1, echoCancellation: true, noiseSuppression: true } })
   // Use AudioWorkletNode for low-latency audio processing
   ```
2. Create `src/renderer/audio/audio-worklet-processor.ts`:
   - AudioWorkletProcessor that collects PCM Float32Array frames
   - Sends frames to main thread via `port.postMessage()`
   - Buffer size: 4096 samples (~85ms at 48kHz) — balance between latency and overhead
3. Create `src/renderer/audio/microphone.ts`:

   ```typescript
   export class MicrophoneCapture {
     private stream: MediaStream | null = null;
     private audioContext: AudioContext | null = null;
     private workletNode: AudioWorkletNode | null = null;

     async start(deviceId?: string): Promise<void> { ... }
     stop(): void { ... }
     onAudioData(callback: (pcm: Float32Array) => void): void { ... }
     static async listDevices(): Promise<MediaDeviceInfo[]> { ... }
   }
   ```

4. Setup IPC bridge to send audio chunks from renderer → main:
   - In `src/preload/index.ts`: expose `electronAPI.sendAudioChunk(buffer: ArrayBuffer)`
   - In `src/main/ipc/handlers.ts`: handle `audio:chunk` event
5. Grant microphone permission in Electron:
   - In main process, handle `session.setPermissionRequestHandler` for `media`

**Key Decisions**:

- AudioWorklet (not ScriptProcessorNode — deprecated, runs on main thread)
- Capture in renderer (has Web Audio API), send to main via IPC for processing
- Use `echoCancellation: true` + `noiseSuppression: true` for cleaner audio

**Files to create**:

- `src/renderer/audio/capture.ts` — MicrophoneCapture class
- `src/renderer/audio/audio-worklet-processor.ts` — AudioWorklet processor
- `src/preload/index.ts` — IPC bridge (audio chunk transfer)
- `src/main/ipc/handlers.ts` — Audio chunk receiver

**Acceptance Criteria**:

- [ ] Microphone permission prompt appears on first use
- [ ] Audio frames arrive in main process as Float32Array
- [ ] Console log shows continuous audio data when speaking
- [ ] No audio glitches or dropouts during 60s capture
- [ ] CPU usage < 5% for audio capture alone

---

### Task 1.5 — Audio Processing: Resample 48kHz → 16kHz Mono Float32

**Priority**: HIGH | **Depends on**: 1.4 | **Estimate**: 2-3 hours

**Description**: whisper.cpp requires 16kHz mono float32 PCM audio. Browser captures at 48kHz. Resample in-process (main process) for zero-dependency solution.

**Steps**:

1. Create `src/main/audio/processor.ts`:

   ```typescript
   export class AudioProcessor {
     private inputSampleRate: number;   // 48000
     private outputSampleRate: number;  // 16000

     /**
      * Resample audio from inputSampleRate to 16kHz mono float32.
      * Uses linear interpolation (sufficient for speech).
      * For higher quality, use polyphase filter — but adds complexity.
      */
     resample(input: Float32Array): Float32Array { ... }

     /**
      * Normalize audio levels to [-1.0, 1.0] range.
      * Apply simple noise gate: zero out samples below threshold.
      */
     normalize(samples: Float32Array): Float32Array { ... }
   }
   ```

2. Implement resampling algorithm:
   - **Linear interpolation** for MVP (simple, fast, good enough for speech)
   - Ratio: 48000/16000 = 3:1 (every 3rd sample with interpolation)
   - Input: Float32Array at 48kHz mono
   - Output: Float32Array at 16kHz mono
3. Add audio buffer accumulation:
   - Incoming chunks are ~85ms (4096 samples at 48kHz)
   - After resample: ~1365 samples at 16kHz per chunk
   - Accumulate until VAD signals end-of-speech (Task 1.6)
4. Unit tests for resampler:
   - Test with known sine wave → verify frequency preserved
   - Test output sample count: `input.length * (16000/48000)`

**Files to create**:

- `src/main/audio/processor.ts` — AudioProcessor class
- `src/main/audio/__tests__/processor.test.ts` — Unit tests

**Acceptance Criteria**:

- [ ] 48kHz input produces correct 16kHz output (sample count = input \* 1/3)
- [ ] Audio quality acceptable for speech (verified by playing back resampled audio)
- [ ] Resampling time < 1ms for 4096 samples
- [ ] No memory leaks during continuous processing

---

### Task 1.6 — Integrate Silero VAD for Speech Detection

**Priority**: HIGH | **Depends on**: 1.4, 1.5 | **Estimate**: 4-5 hours

**Description**: Integrate `@ricky0123/vad-web` (Silero VAD model) to detect speech start/end. VAD runs on resampled 16kHz audio and emits speech segments for STT processing.

**Steps**:

1. Install: `npm install @ricky0123/vad-web onnxruntime-web`
2. Create `src/main/stt/vad.ts`:

   ```typescript
   import { MicVAD } from '@ricky0123/vad-web';

   export class VoiceActivityDetector {
     private vad: MicVAD | null = null;

     /**
      * NOTE: @ricky0123/vad-web is designed for browser.
      * For main process, we may need to use @ricky0123/vad-node instead.
      * Evaluate both: vad-web (renderer) vs vad-node (main process).
      */
     async init(): Promise<void> { ... }

     /**
      * Process audio frame through VAD.
      * Emits:
      * - 'speechStart': speaking detected
      * - 'speechEnd': silence detected, includes accumulated speech audio
      */
     onSpeechEnd(callback: (audio: Float32Array) => void): void { ... }
     onSpeechStart(callback: () => void): void { ... }

     /**
      * VAD parameters to tune:
      * - positiveSpeechThreshold: 0.5 (default) — sensitivity
      * - negativeSpeechThreshold: 0.35 — end-of-speech detection
      * - minSpeechFrames: 3 — avoid false positives
      * - preSpeechPadFrames: 5 — include audio before speech start
      * - redemptionFrames: 8 (~240ms) — tail buffer before declaring end
      */
   }
   ```

3. Evaluate `@ricky0123/vad-node` for main process usage:
   - vad-web: designed for browser, uses onnxruntime-web (WASM)
   - vad-node: uses onnxruntime-node (native), better performance
   - **Decision needed**: If running VAD in main process, use `vad-node`
   - If running in renderer (with AudioWorklet), use `vad-web`
4. Wire audio pipeline: AudioCapture → Resample → VAD → emit speech chunks
5. Create `src/main/audio/pipeline.ts` (simple initial version):
   ```typescript
   export class AudioPipeline {
     // Connects: AudioCapture IPC → Resample → VAD → Speech chunks out
     // Full Pipeline Orchestrator in Sprint 2 (Task 2.5)
   }
   ```
6. Test VAD accuracy:
   - Verify speech segments are 1-5 seconds typically
   - Verify ~200ms tail buffer (silence detection delay)
   - Verify no false positives from ambient noise

**Important: VAD Architecture Decision**:

- **Option A**: VAD in renderer (vad-web) → sends speech segments via IPC to main
- **Option B**: VAD in main process (vad-node) → raw audio comes via IPC, VAD + STT in main
- **Recommended: Option B** — reduces IPC traffic (only speech, not all audio), all ML models in main process

**Files to create**:

- `src/main/stt/vad.ts` — VoiceActivityDetector wrapper
- `src/main/audio/pipeline.ts` — Initial audio pipeline

**Dependencies to install**:

- `@ricky0123/vad-node` (preferred) or `@ricky0123/vad-web`
- `onnxruntime-node` (for vad-node)

**Acceptance Criteria**:

- [ ] VAD correctly detects speech start and end
- [ ] Speech segments emitted are 1-5 seconds (typical sentence)
- [ ] ~200ms delay from actual silence to detection (tail buffer)
- [ ] No false positives during 10s of silence
- [ ] VAD processing < 10ms per audio frame
- [ ] Memory usage: ~30-50 MB for Silero model

---

### Task 1.7 — Microphone Selector UI

**Priority**: HIGH | **Depends on**: 1.1, 1.4 | **Estimate**: 2-3 hours

**Description**: Dropdown component to list and select audio input devices.

**Steps**:

1. Create `src/renderer/components/AudioSourceSelector.tsx`:
   ```tsx
   // 1. Call navigator.mediaDevices.enumerateDevices()
   // 2. Filter for audioinput devices
   // 3. Display as dropdown/select
   // 4. On change → restart MicrophoneCapture with new deviceId
   // 5. Listen for 'devicechange' event for hot-plug
   ```
2. Create Zustand store `src/renderer/stores/settingsStore.ts`:
   ```typescript
   interface SettingsState {
     selectedDeviceId: string | null;
     availableDevices: MediaDeviceInfo[];
     setSelectedDevice: (id: string) => void;
     refreshDevices: () => Promise<void>;
   }
   ```
3. Style with Tailwind CSS — simple dropdown in control bar area

**Files to create**:

- `src/renderer/components/AudioSourceSelector.tsx`
- `src/renderer/stores/settingsStore.ts`

**Acceptance Criteria**:

- [ ] Lists all available microphones
- [ ] Selecting a device switches audio input
- [ ] Default selects system default mic
- [ ] Updates on device plug/unplug (hot-plug)
- [ ] Shows device label (not just ID)

---

### Task 1.8 — Test Mic Capture + VAD on macOS

**Priority**: HIGH | **Depends on**: 1.4, 1.5, 1.6, 1.7 | **Estimate**: 2-3 hours

**Description**: Integration test of the entire Sprint 1 audio pipeline on macOS M1.

**Steps**:

1. Create temporary debug UI in renderer:
   - Audio waveform visualization (simple canvas)
   - VAD status indicator (speaking / silent)
   - Speech segment counter
   - Audio level meter
2. Test scenarios:
   - Normal speech → VAD detects correctly
   - Silence → no false positives
   - Background noise (fan, typing) → VAD handles
   - Switch microphone mid-capture → no crash
   - Permission denied → graceful error message
3. Verify macOS permissions:
   - `NSMicrophoneUsageDescription` in `Info.plist` (via electron-builder)
   - First-run permission prompt works
4. Measure metrics:
   - Audio capture → main process IPC latency
   - Resample processing time
   - VAD processing time per frame
   - Total audio pipeline latency (capture → speech segment ready)
5. Fix any issues found

**Acceptance Criteria**:

- [ ] End-to-end: speak into mic → VAD emits speech segments in main process
- [ ] Microphone permission works on macOS
- [ ] Pipeline latency < 250ms (capture → segment ready)
- [ ] No memory leaks during 10-minute continuous capture
- [ ] Stable: no crashes during normal usage

---

## Sprint 2: Speech-to-Text — whisper.cpp Native Addon (Week 2)

---

### Task 2.1 — Build whisper.cpp as Native N-API Addon with Metal GPU

**Priority**: HIGH | **Depends on**: 1.2 | **Estimate**: 8-10 hours

**Description**: Compile whisper.cpp as a Node.js native addon using N-API. Enable Metal GPU acceleration for M1. This is the most complex build task.

**Steps**:

1. Clone whisper.cpp source into `native/whisper/`:
   ```bash
   cd native/whisper
   git clone https://github.com/ggerganov/whisper.cpp.git vendor/whisper.cpp
   ```
2. Create `native/whisper/binding.gyp`:
   ```python
   {
     "targets": [{
       "target_name": "whisper_addon",
       "sources": ["src/whisper_addon.cc"],
       "include_dirs": [
         "vendor/whisper.cpp/include",
         "vendor/whisper.cpp/ggml/include",
         "<!(node -e \"require('node-addon-api').include\")"
       ],
       "dependencies": ["<!(node -e \"require('node-addon-api').gyp\")"],
       "cflags!": ["-fno-exceptions"],
       "cflags_cc!": ["-fno-exceptions"],
       "xcode_settings": {
         "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
         "CLANG_CXX_LIBRARY": "libc++",
         "MACOSX_DEPLOYMENT_TARGET": "13.0"
       },
       "conditions": [
         ["OS=='mac'", {
           "defines": ["GGML_USE_METAL"],
           "link_settings": {
             "libraries": [
               "-framework Accelerate",
               "-framework Foundation",
               "-framework Metal",
               "-framework MetalKit"
             ]
           },
           "xcode_settings": {
             "OTHER_CFLAGS": ["-DGGML_USE_METAL"]
           }
         }]
       ]
     }]
   }
   ```
3. Create `native/whisper/src/whisper_addon.cc`:
   ```cpp
   // N-API C++ addon exposing:
   //
   // class WhisperModel:
   //   constructor(modelPath: string, options?: { gpu: boolean })
   //   transcribe(audio: Float32Array): Promise<TranscribeResult>
   //   free(): void
   //
   // TranscribeResult = {
   //   text: string,
   //   segments: Array<{ start: number, end: number, text: string }>,
   //   language: string,
   //   processingTimeMs: number
   // }
   //
   // Key implementation:
   // - Use napi_create_async_work for non-blocking transcription
   // - Keep whisper_context alive between calls (expensive to create)
   // - Accept Float32Array (16kHz mono) directly from Node.js buffer
   ```
4. Create TypeScript wrapper `native/whisper/index.ts`:

   ```typescript
   const addon = require('./build/Release/whisper_addon.node');

   export interface TranscribeResult {
     text: string;
     segments: Array<{ start: number; end: number; text: string }>;
     language: string;
     processingTimeMs: number;
   }

   export class WhisperModel {
     private native: any;

     constructor(modelPath: string, options?: { gpu?: boolean }) {
       this.native = new addon.WhisperModel(modelPath, options ?? { gpu: true });
     }

     async transcribe(audio: Float32Array): Promise<TranscribeResult> {
       return this.native.transcribe(audio);
     }

     free(): void {
       this.native.free();
     }
   }
   ```

5. Install build dependencies: `npm install node-addon-api node-gyp`
6. Build: `cd native/whisper && node-gyp rebuild`
7. Verify Metal GPU is active (check whisper.cpp log output for "Metal" references)

**Alternative approach if native build is too complex**:

- Use `whisper-node` npm package (pre-built whisper.cpp bindings)
- Or use `@nichaelwilson/whisper.cpp` — check npm for existing M1 Metal bindings
- Evaluate existing bindings FIRST before building from scratch

**Files to create**:

- `native/whisper/binding.gyp` — Build config
- `native/whisper/src/whisper_addon.cc` — C++ N-API bindings
- `native/whisper/index.ts` — TypeScript wrapper
- `native/whisper/package.json` — Native addon package
- `native/whisper/README.md` — Build instructions

**Acceptance Criteria**:

- [ ] `node-gyp rebuild` succeeds on macOS M1
- [ ] Can load a .ggml model file
- [ ] `transcribe(float32Array)` returns text for known audio
- [ ] Metal GPU acceleration active (verify in logs)
- [ ] Processing time < 500ms for 3s audio chunk with base model
- [ ] Handles invalid input gracefully (empty audio, wrong format)
- [ ] `free()` releases memory properly

---

### Task 2.2 — Implement Model Manager (Auto-download whisper models)

**Priority**: HIGH | **Depends on**: 2.1 | **Estimate**: 3-4 hours

**Description**: Manage downloading, caching, and loading of ML models. Models stored in `~/.open-translator/models/`.

**Steps**:

1. Create `src/main/models/registry.ts`:
   ```typescript
   export const MODEL_REGISTRY = {
     'whisper-tiny': {
       url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
       size: 75_000_000, // ~75MB
       sha256: '...', // integrity check
       filename: 'ggml-tiny.bin',
     },
     'whisper-base': {
       url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
       size: 142_000_000, // ~142MB
       sha256: '...',
       filename: 'ggml-base.bin',
     },
     'silero-vad': {
       url: '...', // ONNX model URL
       size: 3_000_000,
       sha256: '...',
       filename: 'silero_vad.onnx',
     },
     'opus-mt-en-vi': {
       // @huggingface/transformers handles this automatically
       // but define here for tracking/pre-download
       huggingfaceId: 'Helsinki-NLP/opus-mt-en-vi',
       size: 200_000_000,
     },
   } as const;
   ```
2. Create `src/main/models/manager.ts`:

   ```typescript
   export class ModelManager {
     private modelsDir: string; // ~/.open-translator/models/

     constructor() {
       this.modelsDir = path.join(os.homedir(), '.open-translator', 'models');
     }

     async ensureModel(name: string): Promise<string> {
       // Returns path to model file
       // Downloads if not cached, with progress events
     }

     async downloadModel(name: string, onProgress: (p: DownloadProgress) => void): Promise<string> {
       // HTTP download with:
       // - Resume support (Range header)
       // - SHA256 verification after download
       // - Temp file → rename on complete (atomic)
       // - Progress events via IPC to renderer
     }

     isModelCached(name: string): boolean { ... }
     getModelPath(name: string): string { ... }
     async deleteModel(name: string): Promise<void> { ... }
   }
   ```

3. Wire IPC events for download progress UI:
   - `model:download-progress` → renderer shows progress bar
   - `model:ready` → renderer enables start button
4. First-run experience:
   - On app launch, check if required models exist
   - If not, show download dialog with sizes
   - Download in order: Silero VAD (3MB) → whisper base (142MB) → Opus-MT (auto by transformers.js)

**Files to create**:

- `src/main/models/registry.ts` — Model definitions
- `src/main/models/manager.ts` — Download & cache logic

**Acceptance Criteria**:

- [ ] Models download to `~/.open-translator/models/`
- [ ] Download progress reported via IPC (percent, speed)
- [ ] Resume works if download interrupted
- [ ] SHA256 verified after download
- [ ] Corrupt download detected and re-downloaded
- [ ] `ensureModel()` returns instantly if already cached

---

### Task 2.3 — Wire VAD Output → whisper STT Pipeline

**Priority**: HIGH | **Depends on**: 1.6, 2.1, 2.2 | **Estimate**: 3-4 hours

**Description**: Connect VAD speech segments to whisper.cpp for transcription. When VAD detects end-of-speech, send accumulated audio to whisper.

**Steps**:

1. Create `src/main/stt/whisper.ts`:

   ```typescript
   export class WhisperSTT {
     private model: WhisperModel | null = null;
     private modelManager: ModelManager;

     async init(modelName: 'tiny' | 'base' = 'base'): Promise<void> {
       const modelPath = await this.modelManager.ensureModel(`whisper-${modelName}`);
       this.model = new WhisperModel(modelPath, { gpu: true });
     }

     async transcribe(audio: AudioChunk): Promise<TranscriptSegment> {
       const start = performance.now();
       const result = await this.model!.transcribe(audio.samples);
       const sttLatency = performance.now() - start;

       return {
         id: crypto.randomUUID(),
         text: result.text.trim(),
         timestamp: audio.timestamp,
         isFinal: true,
         audioDurationMs: (audio.samples.length / audio.sampleRate) * 1000,
         sttLatencyMs: sttLatency,
         totalLatencyMs: sttLatency, // Translation latency added later
       };
     }

     async switchModel(modelName: 'tiny' | 'base'): Promise<void> {
       // Free current model, load new one
       // Called by adaptive quality system
     }

     free(): void { ... }
   }
   ```

2. Update `src/main/audio/pipeline.ts`:
   ```typescript
   // VAD → WhisperSTT flow:
   // 1. VAD emits speechEnd with Float32Array
   // 2. Pipeline feeds audio to WhisperSTT.transcribe()
   // 3. Result emitted as TranscriptSegment
   ```
3. Handle edge cases:
   - Very short speech segments (< 0.5s) — skip or process with warning
   - Very long segments (> 10s) — split into sub-chunks (edge case for M1)
   - Empty/silence segments from VAD false positives — detect and skip

**Files to create**:

- `src/main/stt/whisper.ts` — WhisperSTT wrapper class

**Acceptance Criteria**:

- [ ] VAD speech segment → whisper → English text output
- [ ] Transcription latency < 500ms for 3s audio (base model)
- [ ] Short segments (< 0.5s) handled gracefully
- [ ] Model loads within 2-3s on first init
- [ ] Memory stable after 50+ transcriptions (no leaks)

---

### Task 2.4 — Handle Interim (Partial) vs Final Transcription

**Priority**: HIGH | **Depends on**: 2.3 | **Estimate**: 2-3 hours

**Description**: Show partial/interim text while speech is ongoing, then replace with final when VAD detects end-of-speech.

**Steps**:

1. Implement interim results strategy:

   ```
   Option A: Timer-based interim
   - While user is speaking (VAD active), every ~1s send accumulated audio to whisper
   - Mark result as isFinal: false
   - When VAD detects end-of-speech, send final chunk → isFinal: true
   - UI replaces interim with final

   Option B: No interim, just final (simpler)
   - Only transcribe when VAD detects end-of-speech
   - Simpler but user sees nothing while others speak
   ```

2. **Recommended: Option A (timer-based interim)** for better UX
3. Update VAD integration to emit both types:
   - `onSpeechActive` → emit interim audio every ~1s
   - `onSpeechEnd` → emit final audio
4. Update `WhisperSTT.transcribe()` to accept `isFinal` parameter
5. Update `TranscriptSegment` handling:
   - Interim segments have a `pendingId` to identify which final replaces which
   - UI shows interim in lighter/italic style
   - Final replaces matching interim segment

**Files to modify**:

- `src/main/stt/vad.ts` — Add interim speech emission
- `src/main/stt/whisper.ts` — Handle interim vs final
- `src/shared/types.ts` — Add `pendingId` to TranscriptSegment if needed

**Acceptance Criteria**:

- [ ] While speaking, interim text appears every ~1s
- [ ] When speech ends, final text replaces interim
- [ ] Interim marked as `isFinal: false`
- [ ] No duplicate text shown (interim correctly replaced)
- [ ] No extra whisper load — interim reuses partial audio, not re-process all

---

### Task 2.5 — Implement Pipeline Orchestrator

**Priority**: HIGH | **Depends on**: 2.3 | **Estimate**: 5-6 hours

**Description**: Central orchestrator that manages the concurrent pipeline: VAD → STT → Translation. Handles queue, backpressure, and concurrent processing so STT for chunk N+1 runs while translating chunk N.

**Steps**:

1. Create `src/main/pipeline/orchestrator.ts`:

   ```typescript
   export class PipelineOrchestrator {
     private queue: AudioChunk[] = [];
     private isProcessingSTT: boolean = false;
     private isProcessingTranslation: boolean = false;
     private maxQueueSize: number = 5; // backpressure limit

     private stt: WhisperSTT;
     private translator: TranslationService; // Sprint 3, stub for now
     private metrics: MetricsTracker;

     /**
      * Called by VAD when speech segment is ready.
      * If queue is full, drop oldest pending chunk (backpressure).
      */
     async enqueue(chunk: AudioChunk): Promise<void> {
       if (this.queue.length >= this.maxQueueSize) {
         this.queue.shift(); // Drop oldest
         this.metrics.recordDropped();
       }
       this.queue.push(chunk);
       this.processNext();
     }

     /**
      * Process pipeline:
      * 1. Dequeue next audio chunk
      * 2. Run STT (async)
      * 3. When STT done, start translation (async) AND dequeue next for STT
      * 4. When translation done, emit to UI
      *
      * Concurrent: STT(N+1) runs in parallel with Translate(N)
      */
     private async processNext(): Promise<void> { ... }

     /**
      * Event emitters:
      * - 'segment' → TranscriptSegment (text + translation)
      * - 'metrics' → PipelineMetrics
      * - 'status' → 'idle' | 'recording' | 'processing'
      */
   }
   ```

2. Create `src/main/pipeline/metrics.ts`:

   ```typescript
   export class MetricsTracker {
     private sttLatencies: number[] = [];      // Rolling window (last 20)
     private translationLatencies: number[] = [];
     private totalLatencies: number[] = [];

     recordSTT(ms: number): void { ... }
     recordTranslation(ms: number): void { ... }
     recordTotal(ms: number): void { ... }
     recordDropped(): void { ... }

     getP95STT(): number { ... }
     getP95Translation(): number { ... }
     getP95Total(): number { ... }

     getMetrics(): PipelineMetrics { ... }

     // Memory monitoring
     getMemoryUsageMB(): number {
       return process.memoryUsage().heapUsed / 1024 / 1024;
     }
   }
   ```

3. Implement concurrent processing:
   - Use `Promise` chaining — when STT resolves, immediately start translation AND next STT
   - NOT `Promise.all` — it's a pipeline, not parallel batch
4. Backpressure handling:
   - Queue max 5 chunks
   - If full, drop oldest (user missed a sentence, but app stays responsive)
   - Emit warning via metrics when dropping
5. Stub translation service for now (Sprint 3):
   ```typescript
   // Temporary stub until Sprint 3
   class StubTranslator implements TranslationService {
     async translate(text: string): Promise<string> {
       return `[VI] ${text}`; // Placeholder
     }
   }
   ```

**Files to create**:

- `src/main/pipeline/orchestrator.ts` — Pipeline Orchestrator
- `src/main/pipeline/metrics.ts` — Metrics tracking

**Acceptance Criteria**:

- [ ] Chunks processed in order (FIFO)
- [ ] STT(N+1) runs concurrently with Translate(N) — verified by logs
- [ ] Queue backpressure: max 5, drops oldest when full
- [ ] Metrics track P95 latency (rolling window of last 20)
- [ ] Memory usage tracked via `process.memoryUsage()`
- [ ] Emits `segment`, `metrics`, `status` events

---

### Task 2.6 — Test STT Latency on M1

**Priority**: HIGH | **Depends on**: 2.1, 2.3, 2.5 | **Estimate**: 2-3 hours

**Description**: Benchmark whisper.cpp STT latency on M1 8GB to validate the < 500ms per chunk target.

**Steps**:

1. Create benchmark script `scripts/benchmark-stt.ts`:
   - Load whisper base model
   - Transcribe 20 audio chunks of varying lengths (1s, 2s, 3s, 5s)
   - Record latencies for each
   - Calculate P50, P95, P99
   - Compare Metal GPU vs CPU-only
2. Test with real-world audio:
   - Use sample meeting recordings (English)
   - Test with noisy audio (background noise)
   - Test with accented English
3. Record results in `docs/BENCHMARKS.md`:
   ```
   | Model | Audio | P50   | P95   | GPU  |
   |-------|-------|-------|-------|------|
   | base  | 3s    | ???ms | ???ms | Metal |
   | tiny  | 3s    | ???ms | ???ms | Metal |
   ```
4. Validate against latency budget (< 500ms for base, < 250ms for tiny)

**Files to create**:

- `scripts/benchmark-stt.ts` — Benchmark script
- `docs/BENCHMARKS.md` — Results

**Acceptance Criteria**:

- [ ] base model P95 < 500ms for 3s audio on M1
- [ ] tiny model P95 < 250ms for 3s audio on M1
- [ ] Metal GPU shows improvement over CPU-only
- [ ] Benchmark results documented

---

### Task 2.7 — Implement Adaptive Model Fallback

**Priority**: MEDIUM | **Depends on**: 2.5, 2.6 | **Estimate**: 3-4 hours

**Description**: Automatically switch whisper model based on performance metrics. Downgrade `base → tiny` if latency is too high or memory is low.

**Steps**:

1. Create `src/main/pipeline/adaptive.ts`:

   ```typescript
   export class AdaptiveModelQuality {
     private currentModel: 'tiny' | 'base' = 'base';
     private checkIntervalMs: number = 60_000;  // Check every 60s for upgrade
     private metrics: MetricsTracker;
     private stt: WhisperSTT;

     /**
      * Called after each transcription with latest metrics.
      * Downgrade rules (immediate):
      *   - P95 total latency > 900ms → switch base → tiny
      *   - Available RAM < 1.5 GB → switch base → tiny
      *
      * Upgrade rules (checked every 60s):
      *   - P95 total latency < 300ms AND RAM > 3GB → suggest base (if on tiny)
      *   - Only suggest, don't auto-upgrade (disruptive — model reload takes ~2s)
      */
     async evaluate(): Promise<void> { ... }

     private async downgrade(): Promise<void> {
       if (this.currentModel === 'tiny') return; // Already at minimum
       console.log('[Adaptive] Downgrading whisper base → tiny');
       await this.stt.switchModel('tiny');
       this.currentModel = 'tiny';
     }

     private getAvailableRAMGB(): number {
       // Use os.freemem() — note: on macOS this may not account for unified memory fully
       // Alternative: use process.memoryUsage()
     }
   }
   ```

2. Integrate into Pipeline Orchestrator:
   - After each `processNext()` cycle, call `adaptive.evaluate()`
   - On model switch, orchestrator pauses queue briefly (~2s)
3. Emit events to UI:
   - `model:switched` → show notification "Switched to faster model for better latency"

**Files to create**:

- `src/main/pipeline/adaptive.ts` — Adaptive quality logic

**Acceptance Criteria**:

- [ ] Auto-downgrade triggers when P95 > 900ms
- [ ] Auto-downgrade triggers when RAM < 1.5GB
- [ ] Model switch takes < 3s (old model freed, new loaded)
- [ ] No audio chunks lost during model switch
- [ ] Upgrade only suggested, not automatic

---

## Sprint 3: Translation & Dual-Panel UI (Week 3)

---

### Task 3.1 — Integrate @huggingface/transformers + Opus-MT ONNX

**Priority**: HIGH | **Depends on**: 2.2 | **Estimate**: 4-5 hours

**Description**: Setup `@huggingface/transformers` to run Helsinki-NLP Opus-MT EN→VI translation model locally using ONNX Runtime. No Python required.

**Steps**:

1. Install: `npm install @huggingface/transformers`
   - This includes ONNX Runtime for Node.js
2. Create `src/main/translation/opus-mt.ts`:

   ```typescript
   import { pipeline, env } from '@huggingface/transformers';

   // Configure model cache directory
   env.cacheDir = path.join(os.homedir(), '.open-translator', 'models', 'hf-cache');

   export class OpusMTTranslator {
     private translator: any = null;  // Pipeline instance

     /**
      * Initialize translation pipeline.
      * First call downloads ~200MB ONNX model (cached for future).
      * Subsequent calls load from cache.
      */
     async init(): Promise<void> {
       this.translator = await pipeline(
         'translation',
         'Helsinki-NLP/opus-mt-en-vi',
         { dtype: 'fp32' }  // or 'q8' for quantized
       );
     }

     /**
      * Translate English text to Vietnamese.
      * @param text - English text from STT
      * @returns Vietnamese translation
      */
     async translate(text: string): Promise<{ translated: string; latencyMs: number }> {
       const start = performance.now();
       const result = await this.translator(text, {
         max_length: 512,
       });
       const latencyMs = performance.now() - start;

       return {
         translated: result[0].translation_text,
         latencyMs,
       };
     }

     /**
      * Batch translate multiple segments (if pipeline supports it).
      * May improve throughput vs individual calls.
      */
     async translateBatch(texts: string[]): Promise<string[]> { ... }

     free(): void {
       this.translator = null;
       // Force GC if needed: global.gc?.()
     }
   }
   ```

3. Test translation quality:
   - Common meeting phrases: "Let's schedule a follow-up", "Can you share your screen?"
   - Technical terms: "We need to deploy the microservice to production"
   - Long sentences (50+ words)
4. Benchmark latency:
   - Short sentence (~5 words): expect ~50-80ms
   - Medium sentence (~15 words): expect ~80-120ms
   - Long sentence (~30 words): expect ~120-200ms
5. Handle model download:
   - `@huggingface/transformers` auto-downloads on first `pipeline()` call
   - Show progress to user via Model Manager integration

**Important Notes**:

- `@huggingface/transformers` v3+ supports Node.js natively with ONNX Runtime
- Verify ONNX Runtime uses Metal/CoreML on M1 (check `onnxruntime-node` acceleration)
- If ONNX performance is poor, fallback plan: use quantized model (`q8`) or evaluate `CTranslate2`

**Files to create**:

- `src/main/translation/opus-mt.ts` — Opus-MT translator class
- `src/main/translation/types.ts` — Translation interfaces

**Acceptance Criteria**:

- [ ] Translation works offline after first model download
- [ ] Latency < 150ms for typical meeting sentences
- [ ] Translation quality acceptable for meeting context
- [ ] Memory usage ~200MB for model
- [ ] No Python dependency needed

---

### Task 3.2 — Translation Service Abstraction Layer

**Priority**: MEDIUM | **Depends on**: 3.1 | **Estimate**: 1-2 hours

**Description**: Abstract translation behind an interface so we can swap Opus-MT with Ollama LLM in Phase 2.

**Steps**:

1. Create `src/main/translation/types.ts`:

   ```typescript
   export interface TranslationService {
     init(): Promise<void>;
     translate(text: string, opts?: TranslationOptions): Promise<TranslationResult>;
     free(): void;
     readonly name: string;
     readonly isReady: boolean;
   }

   export interface TranslationOptions {
     sourceLanguage?: string;
     targetLanguage?: string;
     maxLength?: number;
   }

   export interface TranslationResult {
     translated: string;
     latencyMs: number;
     model: string;
   }
   ```

2. Make `OpusMTTranslator` implement `TranslationService`
3. Create placeholder `src/main/translation/ollama.ts` (Phase 2):
   ```typescript
   export class OllamaTranslator implements TranslationService {
     // Phase 2: Ollama + Qwen2.5-3B for context-aware translation
     // Stub for now
   }
   ```
4. Update Pipeline Orchestrator to use `TranslationService` interface instead of concrete class

**Files to create/modify**:

- `src/main/translation/types.ts` — Interface
- `src/main/translation/ollama.ts` — Placeholder
- Modify `src/main/translation/opus-mt.ts` — Implement interface
- Modify `src/main/pipeline/orchestrator.ts` — Use interface

**Acceptance Criteria**:

- [ ] `TranslationService` interface defined
- [ ] `OpusMTTranslator` implements the interface
- [ ] Orchestrator works with any `TranslationService` implementation
- [ ] Easy to add Ollama translator in Phase 2

---

### Task 3.3 — Build Dual-Panel UI Layout

**Priority**: HIGH | **Depends on**: 1.1, 1.2 | **Estimate**: 4-5 hours

**Description**: Create the main UI with side-by-side English transcript (left) and Vietnamese translation (right) panels.

**Steps**:

1. Create `src/renderer/stores/transcriptStore.ts`:

   ```typescript
   import { create } from 'zustand';

   interface TranscriptState {
     segments: TranscriptSegment[];
     isRecording: boolean;
     metrics: PipelineMetrics | null;
     status: 'idle' | 'recording' | 'processing' | 'error';

     addSegment: (segment: TranscriptSegment) => void;
     updateSegment: (id: string, update: Partial<TranscriptSegment>) => void;
     clearSegments: () => void;
     setRecording: (recording: boolean) => void;
     setStatus: (status: string) => void;
     setMetrics: (metrics: PipelineMetrics) => void;
   }

   export const useTranscriptStore = create<TranscriptState>((set) => ({
     segments: [],
     isRecording: false,
     metrics: null,
     status: 'idle',

     addSegment: (segment) =>
       set((state) => ({
         segments: [...state.segments, segment],
       })),
     updateSegment: (id, update) =>
       set((state) => ({
         segments: state.segments.map((s) => (s.id === id ? { ...s, ...update } : s)),
       })),
     clearSegments: () => set({ segments: [] }),
     setRecording: (recording) => set({ isRecording: recording }),
     setStatus: (status) => set({ status }),
     setMetrics: (metrics) => set({ metrics }),
   }));
   ```

2. Create `src/renderer/components/TranscriptPanel.tsx`:
   ```tsx
   // Props: segments, type ('original' | 'translated'), autoScroll
   // Renders list of text segments
   // Interim segments shown in italic/lighter style
   // Each segment shows timestamp
   // Virtualized list for performance (react-window) if > 100 segments
   ```
3. Create `src/renderer/components/DualPanelView.tsx`:
   ```tsx
   // Two TranscriptPanels side by side
   // Left: English (segment.text)
   // Right: Vietnamese (segment.translated)
   // Flex layout: 50/50 split, resizable divider (optional)
   // Responsive: stack vertically on narrow window
   ```
4. Setup IPC listeners in renderer:
   ```typescript
   // In App.tsx or custom hook useIPCListeners:
   window.electronAPI.on('transcript:segment', (segment) => {
     useTranscriptStore.getState().addSegment(segment);
   });
   ```
5. Style with Tailwind CSS:
   - Clean, readable typography (system font, 16px base)
   - Subtle divider between panels
   - Segment spacing: 8px between items
   - Timestamp: small, muted text

**Files to create**:

- `src/renderer/stores/transcriptStore.ts` — Zustand store
- `src/renderer/components/TranscriptPanel.tsx` — Panel component
- `src/renderer/components/DualPanelView.tsx` — Layout component
- `src/renderer/hooks/useIPCListeners.ts` — IPC event handlers

**Acceptance Criteria**:

- [ ] Two panels side by side, each scrollable independently
- [ ] Segments render with timestamp and text
- [ ] Interim segments visually distinct (italic, lighter color)
- [ ] Layout works at various window sizes (min 800px wide)
- [ ] Smooth rendering with 100+ segments

---

### Task 3.4 — Implement Auto-Scroll Behavior

**Priority**: HIGH | **Depends on**: 3.3 | **Estimate**: 2-3 hours

**Description**: Both panels auto-scroll to show latest content. Pause auto-scroll when user manually scrolls up.

**Steps**:

1. Implement in `TranscriptPanel.tsx`:
   ```typescript
   // Auto-scroll logic:
   // 1. Default: scroll to bottom when new segment added
   // 2. If user scrolls up (scrollTop < scrollHeight - clientHeight - 50px):
   //    → Pause auto-scroll
   //    → Show "↓ New messages" floating button
   // 3. Click button or scroll to bottom → resume auto-scroll
   //
   // Use ref.scrollIntoView({ behavior: 'smooth' }) for smooth scrolling
   // Use IntersectionObserver for "is at bottom" detection
   ```
2. Add "New content" indicator when auto-scroll paused
3. Make sure both panels can scroll independently

**Acceptance Criteria**:

- [ ] New segments cause panel to scroll to bottom
- [ ] Scrolling up pauses auto-scroll
- [ ] "New content" button appears when paused
- [ ] Clicking button scrolls to bottom and resumes
- [ ] Smooth scroll animation (not jarring jumps)

---

### Task 3.5 — Sync Scrolling Between Panels

**Priority**: MEDIUM | **Depends on**: 3.3, 3.4 | **Estimate**: 2-3 hours

**Description**: Optional linked scrolling — scrolling one panel scrolls the other to the matching segment.

**Steps**:

1. Each segment has a unique `id` shared between EN and VI panels
2. When user scrolls left panel, find topmost visible segment `id`
3. Scroll right panel to the same segment `id`
4. Debounce scroll events (every 100ms)
5. Toggle: user can enable/disable sync scroll (default: off, auto-scroll preferred)
6. When auto-scroll is active, sync scroll is not needed (both scroll to bottom)

**Acceptance Criteria**:

- [ ] Scrolling left panel scrolls right to matching segment
- [ ] Sync scroll toggle in settings
- [ ] No infinite scroll loop (A triggers B triggers A)
- [ ] Only active when auto-scroll is paused

---

### Task 3.6 — Display Interim Text with Visual Indicator

**Priority**: MEDIUM | **Depends on**: 2.4, 3.3 | **Estimate**: 1-2 hours

**Description**: Show interim/partial transcription text with distinct visual style. Replace with final when ready.

**Steps**:

1. In `TranscriptPanel.tsx`:
   - `isFinal: false` → render with: italic font, lighter opacity (60%), pulsing dot indicator
   - `isFinal: true` → render normally
2. Transition: when interim becomes final
   - Smooth text replacement (no flash/jump)
   - If final text differs from interim, animate the change subtly
3. Translation panel: show "translating..." placeholder while waiting for translation of final text

**Acceptance Criteria**:

- [ ] Interim text visually distinct from final
- [ ] Smooth transition from interim → final
- [ ] No layout jumps when text changes
- [ ] "Translating..." placeholder in translation panel

---

### Task 3.7 — Session Start/Stop Controls

**Priority**: HIGH | **Depends on**: 1.4, 2.5, 3.3 | **Estimate**: 3-4 hours

**Description**: Control bar with Start/Stop recording button. Orchestrates the entire pipeline lifecycle.

**Steps**:

1. Create `src/renderer/components/ControlBar.tsx`:
   ```tsx
   // Layout: [▶ Start/⏹ Stop] [🎤 Mic selector] [Status indicator] [⚙ Settings]
   // Start button:
   //   1. Request mic permission (if not granted)
   //   2. IPC → main: 'session:start' { deviceId }
   //   3. Main process: init models (if first time), start audio pipeline
   //   4. Button changes to Stop
   // Stop button:
   //   1. IPC → main: 'session:stop'
   //   2. Main: stop audio capture, flush pending chunks, cleanup
   //   3. Button changes to Start
   ```
2. Create session lifecycle in main process `src/main/ipc/handlers.ts`:

   ```typescript
   ipcMain.handle('session:start', async (event, { deviceId }) => {
     // 1. Init models if not loaded (ModelManager.ensureModel)
     // 2. Create AudioPipeline, WhisperSTT, OpusMTTranslator
     // 3. Create PipelineOrchestrator
     // 4. Start mic capture
     // Emit 'pipeline:status' = 'recording'
   });

   ipcMain.handle('session:stop', async () => {
     // 1. Stop mic capture
     // 2. Process remaining queue
     // 3. Free resources? Or keep models loaded for quick restart
     // Emit 'pipeline:status' = 'idle'
   });
   ```

3. Create `src/renderer/components/StatusIndicator.tsx`:
   - Shows: idle (gray) → loading models (yellow pulse) → recording (red dot) → processing (green)
   - Also shows active model name and P95 latency

**Files to create**:

- `src/renderer/components/ControlBar.tsx`
- `src/renderer/components/StatusIndicator.tsx`
- Modify `src/main/ipc/handlers.ts`

**Acceptance Criteria**:

- [ ] Start button initiates recording pipeline
- [ ] Stop button cleanly stops everything
- [ ] Status indicator shows current state
- [ ] First-time start triggers model download (with progress)
- [ ] Quick restart: Stop → Start doesn't reload models
- [ ] Error state: shows error message if mic/model fails

---

## Sprint 4: Polish & Testing (Week 4)

---

### Task 4.1 — Settings Page

**Priority**: HIGH | **Depends on**: 1.7, 2.7, 3.1 | **Estimate**: 3-4 hours

**Description**: Settings dialog/page for configuring audio, models, and display options.

**Steps**:

1. Create `src/renderer/components/SettingsDialog.tsx`:
   ```tsx
   // Sections:
   // 1. Audio
   //    - Microphone selector (reuse AudioSourceSelector)
   //    - Noise suppression toggle
   //
   // 2. Models
   //    - Current whisper model (tiny/base) with change button
   //    - Auto model switch toggle (on by default)
   //    - Model download status & cache size
   //    - "Download all models" button
   //
   // 3. Display
   //    - Font size slider (12-24px)
   //    - Theme toggle (light/dark)
   //    - Sync scroll toggle
   //
   // 4. Performance
   //    - Current P95 latency display
   //    - Memory usage display
   //    - Reset metrics button
   ```
2. Persist settings to disk:
   - Use `electron-store` or simple JSON file at `~/.open-translator/settings.json`
   - Load on app start, save on change
3. Wire settings to pipeline:
   - Model change → `WhisperSTT.switchModel()`
   - Audio device change → restart capture with new deviceId

**Files to create**:

- `src/renderer/components/SettingsDialog.tsx`
- Modify `src/renderer/stores/settingsStore.ts` — Add persistence

**Acceptance Criteria**:

- [ ] Settings persist across app restarts
- [ ] Model switch works from settings
- [ ] Audio device switch works from settings
- [ ] Font size/theme changes apply immediately

---

### Task 4.2 — Error Handling & Graceful Degradation

**Priority**: HIGH | **Depends on**: All Sprint 1-3 | **Estimate**: 4-5 hours

**Description**: Handle all error scenarios gracefully without crashing the app.

**Steps**:

1. Error scenarios to handle:

   ```
   Audio:
   - Mic permission denied → show "Grant permission in System Settings" with link
   - Mic disconnected mid-session → pause, show warning, auto-resume when reconnected
   - No microphone found → disable Start button, show message

   Models:
   - Model download fails (network) → retry with exponential backoff, show error after 3 attempts
   - Model file corrupt → delete and re-download
   - Model load fails (out of memory) → try smaller model

   STT:
   - whisper.cpp crash → catch in N-API, restart STT worker, resume from next chunk
   - Transcription returns empty → skip segment, log warning
   - Transcription timeout (> 5s) → cancel, skip chunk, switch to tiny model

   Translation:
   - ONNX Runtime crash → reinitialize translator
   - Translation empty/garbage → show original text only with ⚠️ icon

   Pipeline:
   - Backpressure (queue full) → drop oldest, show "Processing slow" indicator
   - Memory pressure → trigger adaptive downgrade, show warning
   ```

2. Create `src/main/pipeline/error-handler.ts`:
   ```typescript
   export class PipelineErrorHandler {
     // Centralized error handling with:
     // - Error classification (recoverable vs fatal)
     // - Retry logic with backoff
     // - Error reporting to renderer via IPC
     // - Graceful degradation (continue with reduced quality)
   }
   ```
3. Add error boundary in React:
   ```tsx
   // Wrap App in ErrorBoundary component
   // Show "Something went wrong" with restart button
   // Log error to file
   ```
4. Error logging:
   - Write errors to `~/.open-translator/logs/error.log`
   - Include timestamp, error type, stack trace, system info

**Files to create**:

- `src/main/pipeline/error-handler.ts`
- `src/renderer/components/ErrorBoundary.tsx`

**Acceptance Criteria**:

- [ ] App never crashes on any error scenario listed above
- [ ] User always sees meaningful error message
- [ ] Recoverable errors auto-recover without user action
- [ ] Errors logged to file for debugging
- [ ] Pipeline continues after non-fatal errors

---

### Task 4.3 — Latency P95 Indicator & Memory Display

**Priority**: MEDIUM | **Depends on**: 2.5 | **Estimate**: 2-3 hours

**Description**: Real-time display of pipeline performance metrics in the UI.

**Steps**:

1. Update `StatusIndicator.tsx` or create dedicated `MetricsBar.tsx`:
   ```tsx
   // Display (compact, bottom bar or status bar):
   // - P95 Latency: 650ms (green if < 800ms, yellow if < 1000ms, red if > 1000ms)
   // - Memory: 920 MB / 8192 MB
   // - Model: whisper-base + opus-mt-en-vi
   // - Chunks: 47 processed, 0 dropped
   // - Update every 5s from main process metrics
   ```
2. IPC: Main sends `pipeline:metrics` event every 5s to renderer
3. Color coding:
   - Green: P95 < 800ms → excellent
   - Yellow: P95 800-1000ms → acceptable
   - Red: P95 > 1000ms → degraded (adaptive should be switching models)

**Files to create**:

- `src/renderer/components/MetricsBar.tsx`

**Acceptance Criteria**:

- [ ] Metrics display updates every 5s
- [ ] Color coding reflects performance state
- [ ] Memory shows both app usage and system total
- [ ] Minimal UI footprint (single bottom bar)

---

### Task 4.4 — Basic Dark/Light Theme

**Priority**: LOW | **Depends on**: 3.3 | **Estimate**: 1-2 hours

**Steps**:

1. Use Tailwind `dark:` variant with class strategy
2. In `tailwind.config.js`: `darkMode: 'class'`
3. Toggle by adding/removing `dark` class on `<html>`
4. Default: follow system preference (`prefers-color-scheme`)
5. Store preference in settings

**Acceptance Criteria**:

- [ ] Dark and light themes both look good
- [ ] Toggle works immediately
- [ ] Follows system preference by default

---

### Task 4.5 — End-to-End Testing on macOS M1

**Priority**: HIGH | **Depends on**: All previous | **Estimate**: 4-5 hours

**Description**: Full integration test of the complete pipeline on target hardware (M1 8GB).

**Steps**:

1. Test scenarios:

   ```
   Scenario 1: Basic flow
   → Start recording → speak English into mic → see EN transcript + VI translation
   → Verify latency < 1s after end-of-speech

   Scenario 2: 30-minute continuous session
   → Record for 30 min → verify no memory leaks, no crashes
   → Monitor: RAM stable, latency stable, no growing queue

   Scenario 3: Rapid speech
   → Multiple sentences in quick succession
   → Verify pipeline handles backpressure, no drops for normal speed

   Scenario 4: Silence periods
   → Long pauses between sentences
   → Verify no false positives, no wasted processing

   Scenario 5: Error recovery
   → Disconnect mic mid-session → reconnect → verify auto-resume
   → Force memory pressure → verify model downgrade

   Scenario 6: First-run experience
   → Fresh install → model download → first transcription
   → Verify smooth UX
   ```

2. Performance validation:
   - Measure P95 latency across all test segments
   - Measure peak memory usage
   - Measure CPU/GPU utilization
   - Measure thermal (M1 should not throttle for speech-only workload)
3. Fix any issues found

**Acceptance Criteria**:

- [ ] All 6 scenarios pass
- [ ] P95 latency < 1000ms across all test segments
- [ ] Memory peaks < 1.5 GB
- [ ] 30-minute session stable (no leaks, no crashes)
- [ ] First-run UX smooth

---

### Task 4.6 — Package & Build .dmg for macOS

**Priority**: HIGH | **Depends on**: 4.5 | **Estimate**: 3-4 hours

**Description**: Build distributable `.dmg` installer for macOS using `electron-builder`.

**Steps**:

1. Configure `electron-builder.yml`:
   ```yaml
   appId: com.open-translator.app
   productName: Open Translator
   mac:
     target:
       - target: dmg
         arch:
           - arm64 # M1/M2 only for now
     category: public.app-category.productivity
     icon: resources/icon.icns
     hardenedRuntime: true
     entitlements: build/entitlements.mac.plist
     entitlementsInherit: build/entitlements.mac.plist
   dmg:
     contents:
       - x: 130
         y: 220
       - x: 410
         y: 220
         type: link
         path: /Applications
   ```
2. Create `build/entitlements.mac.plist`:
   ```xml
   <!-- Required entitlements: -->
   <!-- com.apple.security.device.audio-input — microphone access -->
   <!-- com.apple.security.cs.allow-jit — for ONNX Runtime -->
   <!-- com.apple.security.cs.allow-unsigned-executable-memory — for whisper.cpp Metal -->
   ```
3. Handle native addon packaging:
   - whisper.cpp native addon must be included in the build
   - Configure `electron-builder` to copy `native/whisper/build/Release/whisper_addon.node`
   - Or use `electron-rebuild` to rebuild native addons for target
4. Build: `npm run build && npx electron-builder --mac`
5. Test: open `.dmg`, drag to Applications, launch, verify full pipeline works

**Files to create**:

- `electron-builder.yml` — Build config
- `build/entitlements.mac.plist` — macOS entitlements
- `resources/icon.icns` — App icon (placeholder)

**Acceptance Criteria**:

- [ ] `npm run build:mac` produces `.dmg` file
- [ ] Install from `.dmg` works
- [ ] App launches correctly from Applications
- [ ] Native addon (whisper.cpp) works in packaged app
- [ ] Microphone permission prompt works in packaged app
- [ ] ONNX Runtime works in packaged app

---

### Task 4.7 — README & Setup Instructions

**Priority**: MEDIUM | **Depends on**: 4.6 | **Estimate**: 1-2 hours

**Steps**:

1. Create `README.md`:

   ```markdown
   # Open Translator

   Real-time English → Vietnamese meeting transcription & translation.
   100% local, 100% free.

   ## Quick Start

   1. Download .dmg from Releases
   2. Install → Open → Grant microphone permission
   3. Click Start → speak English → see translation

   ## Development

   - Prerequisites: Node.js 18+, Xcode Command Line Tools
   - npm install
   - cd native/whisper && node-gyp rebuild
   - npm run dev

   ## Architecture

   See docs/PROJECT.md

   ## Tech Stack

   - Electron + React + TypeScript
   - whisper.cpp (Metal GPU) for STT
   - Opus-MT (ONNX) for translation
   - Silero VAD for speech detection
   ```

**Acceptance Criteria**:

- [ ] README has install and dev setup instructions
- [ ] New developer can set up and run project following README
- [ ] Screenshots of the app included

---

## Task Dependency Graph

```
Sprint 1:
  1.1 ─┬─ 1.2 ─── 1.4 ─── 1.5 ─── 1.6 ─── 1.8
       │                    │
       ├─ 1.3              1.7
       │
Sprint 2:
  1.2 ─── 2.1 ─── 2.2 ─── 2.3 ─── 2.4
                            │
  1.6 ─────────────────── 2.3 ─── 2.5 ─── 2.6 ─── 2.7
                                    │
Sprint 3:                           │
  2.2 ─── 3.1 ─── 3.2             │
  1.1 ─── 3.3 ─── 3.4 ─── 3.5    │
  2.4 ─── 3.6                      │
  (1.4 + 2.5 + 3.3) ─── 3.7      │
                                    │
Sprint 4:                           │
  (1.7 + 2.7 + 3.1) ─── 4.1      │
  (all sprint 1-3) ─── 4.2        │
  2.5 ─── 4.3                      │
  3.3 ─── 4.4                      │
  (all) ─── 4.5 ─── 4.6 ─── 4.7  │
```

---

## Critical Path

The **longest dependency chain** that determines minimum timeline:

```
1.1 → 1.2 → 1.4 → 1.5 → 1.6 → 2.3 → 2.5 → 3.7 → 4.5 → 4.6
```

**Parallelizable work**:

- Task 2.1 (native addon build) can start in parallel with 1.4-1.6
- Task 3.1 (transformers.js) can start in parallel with Sprint 2
- Task 3.3 (UI) can start in parallel with Sprint 2
- Task 1.3 (linting) anytime
- Task 4.4 (theme) anytime after 3.3

---

## Risk Mitigation Tasks (Do Early)

| Risk                                      | Mitigation Task                                                          | When       |
| ----------------------------------------- | ------------------------------------------------------------------------ | ---------- |
| whisper.cpp N-API build fails on M1       | **Evaluate `whisper-node` npm** as fallback BEFORE building custom addon | Before 2.1 |
| @huggingface/transformers ONNX perf on M1 | **Benchmark Opus-MT translation** standalone before full integration     | Before 3.1 |
| VAD library compatibility (web vs node)   | **Test both `vad-web` and `vad-node`** in Electron main process          | During 1.6 |
| Audio IPC overhead renderer→main          | **Benchmark IPC transfer** of Float32Array buffers                       | During 1.4 |
