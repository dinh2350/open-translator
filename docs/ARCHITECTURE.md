# Open Translator — Architecture

> Real-time English → Vietnamese meeting transcription & translation.
> 100% offline, runs on macOS M1.

---

## 1. Tech Stack

| Layer | Technology | Vai trò |
|---|---|---|
| **Desktop Shell** | Electron v39 | Host cả renderer + main process |
| **Frontend** | React 19 + TypeScript + Tailwind CSS v4 | Component UI, state management |
| **Build Tool** | Vite 7 + electron-vite | Fast HMR, bundling cho Electron |
| **State Management** | Zustand v5 | Minimal store cho transcript + settings |
| **Audio Capture** | Web Audio API (`getUserMedia` + AudioWorklet) | Capture mic, stream PCM frames |
| **VAD** | Silero VAD (ONNX Runtime) | Phát hiện đầu/cuối câu nói |
| **Speech-to-Text** | whisper.cpp (C++ N-API native addon, Metal GPU) | Chuyển audio → English text |
| **Translation** | @huggingface/transformers + ONNX Runtime (Opus-MT) | EN → VI, chạy in-process Node.js |
| **IPC** | Electron `ipcMain` / `ipcRenderer` (contextBridge) | Giao tiếp Renderer ↔ Main |
| **Storage** | File system JSON (settings) | Lưu cài đặt người dùng |
| **Testing** | Vitest | Unit tests cho pipeline/metrics |

---

## 2. System Architecture

```mermaid
graph TB
    classDef renderer fill:#1e40af,stroke:#93c5fd,color:#fff
    classDef store fill:#1d4ed8,stroke:#60a5fa,color:#fff
    classDef preload fill:#374151,stroke:#9ca3af,color:#fff
    classDef main fill:#065f46,stroke:#6ee7b7,color:#fff
    classDef pipeline fill:#047857,stroke:#34d399,color:#fff
    classDef audio fill:#0f4c81,stroke:#38bdf8,color:#fff
    classDef native fill:#92400e,stroke:#fbbf24,color:#fff
    classDef model fill:#7c2d12,stroke:#fb923c,color:#fff
    classDef storage fill:#4c1d95,stroke:#c4b5fd,color:#fff
    classDef ipc fill:#1e3a5f,stroke:#7dd3fc,color:#fff

    subgraph RENDERER["🖥️  Renderer Process (Chromium + React)"]
        direction TB
        UI_ControlBar["ControlBar\n▶ Start / ⏹ Stop / 🎤 Mic"]:::renderer
        UI_DualPanel["DualPanelView\nEN Panel | VI Panel"]:::renderer
        UI_Debug["AudioDebugPanel\nMetricsBar / ErrorToast"]:::renderer
        UI_Settings["SettingsDialog"]:::renderer

        Store_Transcript["transcriptStore\n(Zustand)"]:::store
        Store_Settings["settingsStore\n(Zustand)"]:::store

        Hook_IPC["useIPCListeners\n(hook)"]:::renderer
        Audio_Worklet["AudioWorklet\naudio-worklet-processor.js"]:::audio
        Mic["Web Audio API\ngetUserMedia()"]:::audio
    end

    subgraph PRELOAD["🔒  Preload Script (contextBridge)"]
        Bridge["electronAPI\nipcRenderer.invoke / on"]:::preload
    end

    subgraph MAIN["⚙️  Main Process (Node.js)"]
        direction TB
        IPC_Handlers["IPC Handlers\nsession:start / stop\naudio:chunk / devices"]:::main

        subgraph AUDIO_LAYER["Audio Layer"]
            AudioPipeline["AudioPipeline"]:::pipeline
            AudioProcessor["AudioProcessor\n48kHz → 16kHz resample"]:::pipeline
            VAD["VoiceActivityDetector\nSilero VAD (ONNX)"]:::pipeline
        end

        subgraph PIPELINE_LAYER["Pipeline Layer"]
            Orchestrator["PipelineOrchestrator\nqueue + backpressure"]:::pipeline
            ErrorHandler["PipelineErrorHandler\nretry + circuit breaker"]:::pipeline
            Metrics["MetricsTracker\nP95 latency tracking"]:::pipeline
            Adaptive["AdaptiveModelQuality\nauto tiny↔base switch"]:::pipeline
        end

        subgraph STT_LAYER["STT Layer"]
            WhisperSTT["WhisperSTT\nmodel loader + queue"]:::pipeline
        end

        subgraph TRANSLATION_LAYER["Translation Layer"]
            OpusMT["OpusMTTranslator\n@huggingface/transformers"]:::pipeline
        end

        ModelManager["ModelManager\ndownload + cache"]:::main
        Storage["Settings Storage\nJSON (fs)"]:::main
    end

    subgraph NATIVE["🔧  Native Layer (C++)"]
        WhisperAddon["whisper_addon.node\nN-API Addon"]:::native
        WhisperCpp["whisper.cpp\nMetal GPU (Apple Silicon)"]:::native
    end

    subgraph MODELS["📦  ML Models (disk cache)"]
        ModelWhisper["whisper tiny/base/small\n~/.open-translator/models/"]:::model
        ModelOpusMT["Xenova/opus-mt-en-vi\n~/.open-translator/models/hf-cache/"]:::model
        ModelVAD["silero_vad.onnx\nresources/models/"]:::model
    end

    %% Renderer internal
    Mic -->|"PCM Float32Array\n48kHz"| Audio_Worklet
    Audio_Worklet -->|"audio:chunk IPC"| Bridge
    UI_ControlBar --> Store_Transcript
    UI_DualPanel --> Store_Transcript
    UI_Settings --> Store_Settings
    Hook_IPC --> Store_Transcript
    Hook_IPC --> Store_Settings

    %% Renderer ↔ Preload ↔ Main
    Bridge <-->|"contextBridge\nsandboxed IPC"| IPC_Handlers

    %% Main internal - audio path
    IPC_Handlers --> AudioPipeline
    AudioPipeline --> AudioProcessor
    AudioProcessor --> VAD
    VAD -->|"onSpeechEnd\n(AudioChunk 16kHz)"| Orchestrator

    %% Main internal - pipeline
    Orchestrator --> WhisperSTT
    Orchestrator --> OpusMT
    Orchestrator --> Metrics
    Orchestrator --> ErrorHandler
    Metrics --> Adaptive
    Adaptive -->|"switchModel()"| WhisperSTT

    %% STT → Native
    WhisperSTT -->|"transcribe(Float32)"| WhisperAddon
    WhisperAddon --> WhisperCpp
    WhisperCpp -.->|"loads"| ModelWhisper

    %% Translation
    OpusMT -.->|"loads"| ModelOpusMT

    %% VAD model
    VAD -.->|"loads"| ModelVAD

    %% Model Manager
    ModelManager -.->|"ensureModel()"| ModelWhisper
    IPC_Handlers --> ModelManager

    %% Settings
    IPC_Handlers --> Storage

    %% Result back to renderer
    Orchestrator -->|"pipeline:event IPC\n(TranscriptSegment)"| Bridge

    style RENDERER fill:#0f172a,stroke:#3b82f6,color:#fff
    style PRELOAD fill:#1c1917,stroke:#6b7280,color:#fff
    style MAIN fill:#052e16,stroke:#16a34a,color:#fff
    style NATIVE fill:#431407,stroke:#f97316,color:#fff
    style MODELS fill:#1e1b4b,stroke:#7c3aed,color:#fff
    style AUDIO_LAYER fill:#082f49,stroke:#0ea5e9,color:#fff
    style PIPELINE_LAYER fill:#052e16,stroke:#22c55e,color:#fff
    style STT_LAYER fill:#431407,stroke:#fb923c,color:#fff
    style TRANSLATION_LAYER fill:#1a1a2e,stroke:#a78bfa,color:#fff
```

---

## 3. Data Flow Pipeline

```mermaid
flowchart LR
    classDef srcNode fill:#0f4c81,stroke:#38bdf8,color:#fff
    classDef procNode fill:#065f46,stroke:#34d399,color:#fff
    classDef mlNode fill:#7c2d12,stroke:#fb923c,color:#fff
    classDef uiNode fill:#1e3a8a,stroke:#93c5fd,color:#fff
    classDef storeNode fill:#4c1d95,stroke:#c4b5fd,color:#fff

    MIC["🎤 Microphone\ngetUserMedia()"]:::srcNode
    WORKLET["AudioWorklet\n48kHz PCM"]:::srcNode
    RESAMPLE["AudioProcessor\n48→16kHz resample"]:::procNode
    VAD["Silero VAD\nspeech detection"]:::mlNode
    ORCH["PipelineOrchestrator\nqueue + backpressure"]:::procNode
    WHISPER["whisper.cpp\nMetal GPU\n~300-500ms"]:::mlNode
    TRANSLATE["Opus-MT\nONNX Runtime\n~80-150ms"]:::mlNode
    IPC["Electron IPC\npipeline:event"]:::procNode
    STORE["transcriptStore\n(Zustand)"]:::storeNode
    UI["DualPanelView\nEN | VI panels"]:::uiNode

    MIC -->|"stream"| WORKLET
    WORKLET -->|"Float32Array\naudio:chunk"| RESAMPLE
    RESAMPLE -->|"16kHz mono"| VAD
    VAD -->|"onSpeechEnd\n(AudioChunk)"| ORCH
    ORCH -->|"transcribe()"| WHISPER
    WHISPER -->|"{ text, timestamps }"| TRANSLATE
    TRANSLATE -->|"{ original, translated }"| IPC
    IPC -->|"TranscriptSegment"| STORE
    STORE -->|"re-render"| UI

    NOTE1["⏱ < 1s window\n(after end-of-speech)"]
    VAD -.->|"start timing"| NOTE1
    UI -.->|"end timing"| NOTE1
```

---

## 4. Concurrent Pipeline

```mermaid
gantt
    title Concurrent Pipeline — Latency per audio chunk
    dateFormat  SSS
    axisFormat %Lms

    section Chunk 1
    VAD detect       :a1, 000, 200ms
    whisper.cpp STT  :a2, after a1, 450ms
    Opus-MT Translate:a3, after a2, 130ms
    IPC + Render     :a4, after a3, 25ms

    section Chunk 2 (pipelined)
    VAD detect       :b1, 500, 200ms
    whisper.cpp STT  :b2, after b1, 450ms
    Opus-MT Translate:b3, after b2, 130ms
    IPC + Render     :b4, after b3, 25ms
```

---

## 5. Electron Process Model

```mermaid
graph LR
    classDef chromium fill:#1e40af,stroke:#93c5fd,color:#fff
    classDef nodejs fill:#065f46,stroke:#6ee7b7,color:#fff
    classDef bridge fill:#374151,stroke:#d1d5db,color:#fff

    subgraph "Renderer Process (Chromium)"
        R["React App\nWeb Audio API\nZustand stores"]:::chromium
    end

    subgraph "Preload Script"
        P["contextBridge\nelectronAPI\n(sandbox boundary)"]:::bridge
    end

    subgraph "Main Process (Node.js)"
        M["IPC Handlers\nAudio Pipeline\nSTT + Translation\nModel Manager\nSettings Storage"]:::nodejs
    end

    R <-->|"ipcRenderer\n(typed events)"| P
    P <-->|"ipcMain\n(handlers)"| M

    style "Renderer Process (Chromium)" fill:#0f172a,stroke:#3b82f6
    style "Preload Script" fill:#1c1917,stroke:#6b7280
    style "Main Process (Node.js)" fill:#052e16,stroke:#16a34a
```

---

## 6. Adaptive Quality System

```mermaid
stateDiagram-v2
    [*] --> tiny_en : app start\n(default model)

    tiny_en : whisper tiny.en\n~150-250ms | WER ~8%
    base_en : whisper base.en\n~300-500ms | WER ~5%
    small_en : whisper small.en\n~600-900ms | WER ~3.5%

    tiny_en --> base_en : P95 < 300ms\nAND RAM > 3GB
    base_en --> tiny_en : P95 > 900ms\nOR RAM < 1.5GB
    base_en --> small_en : P95 < 300ms\nAND RAM > 3GB
    small_en --> base_en : P95 > 900ms\nOR RAM < 1.5GB
```

---

## 7. Latency Budget

```
End-of-speech → text on screen  (target < 1s)

┌──────────────┬────────────┬────────────────────────┐
│ Stage        │ Latency    │ Component              │
├──────────────┼────────────┼────────────────────────┤
│ VAD buffer   │ ~200ms     │ Silero VAD (ONNX)      │
│ whisper.cpp  │ ~300-500ms │ Metal GPU, base model  │
│ Opus-MT      │ ~80-150ms  │ @huggingface/transform │
│ IPC + render │ ~20-30ms   │ Electron IPC + React   │
├──────────────┼────────────┼────────────────────────┤
│ TOTAL        │ ~600-880ms │ ✅ Under 1s            │
└──────────────┴────────────┴────────────────────────┘
```
