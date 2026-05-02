# Improvement Plan — Open Translator

> Dựa trên research về các alternatives tốt nhất (May 2026).
> Tất cả cải tiến đều **free, self-hosted, 100% offline**.

---

## Tổng quan ưu tiên

| # | Cải tiến | Priority | Effort | Impact |
|---|---|---|---|---|
| P1 | Bật Core ML cho whisper.cpp (Apple Neural Engine) | 🔴 Cao | Thấp | STT nhanh hơn 3x |
| P2 | Nâng cấp Opus-MT model sang `opus-mt-tc-big-en-vi` | 🟡 Trung bình | Thấp | Chất lượng dịch VI tốt hơn |
| P3 | Tích hợp Silero VAD built-in của whisper.cpp | 🟡 Trung bình | Trung bình | Giảm complexity, bỏ ONNX VAD riêng |
| P4 | Thêm `whisper-large-v3-turbo` vào model registry | 🟢 Thấp | Thấp | Tùy chọn accuracy cao cho máy 16GB+ |

---

## P1 — Bật Core ML cho whisper.cpp (Apple Neural Engine)

**Priority**: 🔴 Cao
**Effort**: Thấp (~2–4 giờ)
**Impact**: STT latency giảm từ ~300–500ms xuống ~100–150ms (3x faster trên M1)

### Vấn đề hiện tại

whisper.cpp đang dùng **Metal GPU** để inference. Trên Apple Silicon, **Apple Neural Engine (ANE)** thông qua **Core ML** nhanh hơn Metal GPU tới 3x cho Whisper encoder — và không chiếm GPU.

```
Hiện tại (Metal):   whisper base.en ~300–500ms
Sau cải tiến (ANE): whisper base.en ~100–150ms  ← 3x faster
```

### Các bước thực hiện

#### Bước 1: Cài Python dependencies để generate Core ML model
```bash
cd native/whisper/vendor/whisper.cpp
pip install ane_transformers openai-whisper coremltools
```

#### Bước 2: Generate Core ML encoder model
```bash
# Cho model tiny.en
./models/generate-coreml-model.sh tiny.en
# Kết quả: models/ggml-tiny.en-encoder.mlmodelc/

# Cho model base.en
./models/generate-coreml-model.sh base.en
# Kết quả: models/ggml-base.en-encoder.mlmodelc/
```

> ⚠️ Lần chạy đầu tiên chậm vì ANE phải compile model sang device-specific format. Cần handle UX: hiển thị "Optimizing for your device (one-time setup)..."

#### Bước 3: Rebuild whisper_addon với Core ML flag
```bash
cd native/whisper/build
cmake .. -DWHISPER_COREML=1
cmake --build . --config Release
```

Hoặc thêm vào `native/whisper/CMakeLists.txt`:
```cmake
set(WHISPER_COREML ON)
```

#### Bước 4: Cập nhật ModelManager để bundle `.mlmodelc`

File: `src/main/models/manager.ts`

Khi download/cache model, copy cả `.mlmodelc` kèm theo `.bin`:
- `~/.open-translator/models/ggml-tiny.en.bin`
- `~/.open-translator/models/ggml-tiny.en-encoder.mlmodelc/` ← thêm mới

#### Bước 5: Cập nhật `WhisperSTT.init()`

File: `src/main/stt/whisper.ts`

```typescript
// Sau khi bật Core ML (nếu N-API addon expose option)
const useCoreML = process.platform === 'darwin' && process.arch === 'arm64';
this.model = new WhisperModel(modelPath, {
  gpu: false,
  nThreads: 4,
  coreml: useCoreML,  // ← thêm flag này
});
```

#### Bước 6: Test & benchmark
```bash
npm run benchmark-stt
# So sánh P95 latency trước/sau bật Core ML
```

### Acceptance Criteria

- [ ] Addon build thành công với `-DWHISPER_COREML=1` trên macOS ARM64
- [ ] Console log hiển thị `whisper_init_state: Core ML model loaded` khi khởi động
- [ ] STT P95 latency `tiny.en` giảm xuống < 150ms (từ ~250ms)
- [ ] STT P95 latency `base.en` giảm xuống < 200ms (từ ~500ms)
- [ ] Fallback sang Metal GPU khi Core ML không khả dụng (Intel Mac, CI)

### Latency budget sau P1

```
VAD detect:         ~200ms  (không đổi)
whisper.cpp (ANE):  ~100–150ms  (↓ từ 300–500ms)
Opus-MT:            ~80–150ms   (không đổi)
IPC + render:       ~20–30ms    (không đổi)
────────────────────────────────────────────
TOTAL:              ~400–530ms  (↓ từ 600–880ms) ✅
```

---

## P2 — Nâng cấp Opus-MT model sang `opus-mt-tc-big-en-vi`

**Priority**: 🟡 Trung bình
**Effort**: Thấp (~1–2 giờ + benchmark time)
**Impact**: Chất lượng dịch EN→VI cải thiện ~10–15% BLEU score

### Vấn đề hiện tại

Model hiện tại: `Xenova/opus-mt-en-vi` — model nhỏ, cũ, chất lượng trung bình.

Helsinki-NLP release model mới hơn: `Helsinki-NLP/opus-mt-tc-big-en-vi` — train trên nhiều data hơn, tốt hơn đáng kể cho domain technical/meeting.

Cả 2 đều: free (CC-BY 4.0), chạy với `@huggingface/transformers` + ONNX Runtime, không cần thay đổi code logic.

### Các bước thực hiện

#### Bước 1: Kiểm tra ONNX conversion tồn tại chưa

Trước khi implement, verify model đã có ONNX version trên HuggingFace:
- Tìm `Xenova/opus-mt-tc-big-en-vi` hoặc `Helsinki-NLP/opus-mt-tc-big-en-vi` trên HF Hub
- Nếu chưa có, cần self-convert bằng `optimum-cli` (xem ghi chú kỹ thuật bên dưới)

#### Bước 2: Đổi MODEL_ID

File: `src/main/translation/opus-mt.ts`

```typescript
// Hiện tại
const MODEL_ID = 'Xenova/opus-mt-en-vi';

// Thay bằng
const MODEL_ID = 'Xenova/opus-mt-tc-big-en-vi'; // hoặc Helsinki-NLP variant
```

#### Bước 3: Benchmark chất lượng dịch và latency

Thử với các câu meeting thực tế:
```
"We need to deploy the microservices to production by Friday"
"Let's circle back on this in the next sprint"
"The budget is $150,000 for Q2 — we're 20% over"
"Can you share your screen and walk us through the architecture?"
```

Đo latency: model `tc-big` nặng hơn (~300MB vs ~200MB).

#### Bước 4 (Optional): Thêm model quality selector vào Settings UI

```typescript
// SettingsDialog: thêm option
<select name="translationModel">
  <option value="Xenova/opus-mt-en-vi">Fast (~200MB, standard quality)</option>
  <option value="Xenova/opus-mt-tc-big-en-vi">Quality (~300MB, better accuracy)</option>
</select>
```

### Acceptance Criteria

- [ ] App load và init được model mới thành công
- [ ] Translation P95 latency vẫn < 200ms trên M1 8GB
- [ ] Chất lượng dịch câu meeting context rõ ràng cải thiện (manual evaluation)
- [ ] Tổng RAM app không vượt 1.1GB (headroom để chạy cùng Zoom)

### Risk

| Risk | Khả năng | Mitigation |
|---|---|---|
| Model `tc-big` chưa có ONNX version | Trung bình | Self-convert bằng `optimum-cli` |
| Latency tăng > 50ms | Thấp | Đo benchmark trước khi merge, giữ `opus-mt-en-vi` làm fallback |
| RAM vượt budget | Thấp | Monitor với MetricsTracker, auto-fallback nếu RAM < 1.5GB |

---

## P3 — Tích hợp Silero VAD built-in của whisper.cpp

**Priority**: 🟡 Trung bình
**Effort**: Trung bình (~1–2 ngày)
**Impact**: Giảm complexity, loại bỏ ONNX Runtime riêng cho VAD, giảm ~20MB RAM

### Vấn đề hiện tại

VAD hiện dùng `@ricky0123/vad-web` trong **Renderer process** — chạy ONNX Runtime riêng, load `silero_vad.onnx` trong browser context.

Từ **whisper.cpp v1.8+**, Silero VAD **v6.2.0** đã được tích hợp trực tiếp vào core với `--vad` flag, dùng ggml format. Có thể chạy toàn bộ ở **Main Process**.

### Kiến trúc trước/sau

```
Hiện tại:
  Renderer → [AudioWorklet] → [Silero VAD (ONNX, browser)] → IPC (speech chunks) → Main

Sau thay đổi:
  Renderer → [AudioWorklet] → IPC (raw PCM) → Main → [whisper.cpp built-in VAD] → STT
```

### Các bước thực hiện

#### Bước 1: Kiểm tra N-API addon có expose VAD API không

File: `native/whisper/src/whisper_addon.cc`

Kiểm tra `whisper_full_params` có field `vad`, `vad_model_path`, `vad_thold` được expose qua N-API chưa. Đây là **blocker** — nếu chưa có, phải extend addon trước.

#### Bước 2: Extend N-API addon (nếu cần)

Thêm VAD streaming API vào `whisper_addon.cc`:
```cpp
// whisper_full_params support vad_model_path
// Expose onSpeechStart / onSpeechEnd callbacks qua N-API
```

Rebuild addon:
```bash
cd native/whisper/build
cmake .. -DWHISPER_COREML=1  # giữ Core ML nếu đã làm P1
cmake --build . --config Release
```

#### Bước 3: Thêm Silero VAD ggml model vào ModelManager

File: `src/main/models/manager.ts`

```typescript
'silero-vad-v6': {
  url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
  filename: 'ggml-silero-v6.2.0.bin',
  sizeBytes: 885_000, // ~864KB
}
```

#### Bước 4: Refactor `VoiceActivityDetector`

File: `src/main/stt/vad.ts`

Thay thế implementation dùng `@ricky0123/vad-web` bằng wrapper gọi whisper.cpp built-in VAD. Giữ nguyên interface:
- `onSpeechStart(callback)` ← không đổi
- `onSpeechEnd(callback: (audio: Float32Array) => void)` ← không đổi
- `onSpeechActive(callback)` ← không đổi

#### Bước 5: Đơn giản hóa Renderer audio capture

File: `src/renderer/audio/microphone.ts`

Bỏ VAD logic trong renderer, chỉ stream raw PCM 48kHz qua IPC.

#### Bước 6: Cleanup dependencies
```bash
npm uninstall @ricky0123/vad-web
# Xóa resources/models/silero_vad.onnx
```

### Acceptance Criteria

- [ ] App không còn load `silero_vad.onnx` hoặc ONNX Runtime trong renderer
- [ ] `@ricky0123/vad-web` được xóa khỏi `package.json`
- [ ] VAD latency (end-of-speech detection) vẫn < 250ms
- [ ] False positive/negative rate tương đương hoặc tốt hơn (Silero v6.2 > v5.x)
- [ ] RAM renderer process giảm ~20–30MB

### Risk

| Risk | Khả năng | Mitigation |
|---|---|---|
| N-API addon chưa expose VAD streaming | Cao | Cần extend addon — estimate thêm 4-8h |
| Regression trong speech detection accuracy | Thấp | A/B test trước khi merge |
| IPC bandwidth tăng (raw PCM vs speech-only) | Trung bình | PCM 16kHz = 32KB/s — Electron IPC handle được |

---

## P4 — Thêm `whisper-large-v3-turbo` vào Model Registry

**Priority**: 🟢 Thấp
**Effort**: Thấp (~2–3 giờ)
**Impact**: Tùy chọn accuracy cao nhất cho user có máy 16GB+ RAM

### Về model

`whisper-large-v3-turbo` (809M params, pruned từ large-v3):
- **WER**: 7.83 (so với base ~5% — cải thiện đáng kể)
- **RAM**: ~800MB model + overhead
- **GGML disk size**: ~800MB
- **Yêu cầu**: M1 16GB+ để chạy cùng app khác

### Các bước thực hiện

#### Bước 1: Thêm vào model registry

File: `src/main/models/manager.ts`

```typescript
'whisper-large-v3-turbo': {
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
  filename: 'ggml-large-v3-turbo.bin',
  sizeBytes: 834_000_000,
  minRamGB: 12,  // guard threshold
}
```

#### Bước 2: Cập nhật `WhisperModelName` type

File: `src/main/stt/whisper.ts`

```typescript
export type WhisperModelName =
  | 'tiny' | 'tiny.en'
  | 'base' | 'base.en'
  | 'small' | 'small.en'
  | 'large-v3-turbo';  // ← thêm mới
```

#### Bước 3: RAM guard trước khi load

```typescript
if (modelName === 'large-v3-turbo') {
  const { systemMemoryMB } = await getSystemMemory();
  if (systemMemoryMB < 12_000) {
    throw new Error(
      'whisper large-v3-turbo requires 16GB RAM. ' +
      `Detected: ${Math.round(systemMemoryMB / 1024)}GB.`
    );
  }
}
```

#### Bước 4: Cập nhật `AdaptiveModelQuality`

File: `src/main/pipeline/adaptive.ts`

Không tự động upgrade lên `large-v3-turbo`. Chỉ cho phép khi user explicitly chọn trong Settings.

#### Bước 5: Cập nhật Settings UI

File: `src/renderer/src/components/SettingsDialog.tsx`

```tsx
<option value="large-v3-turbo" disabled={systemRamGB < 12}>
  Large-v3-Turbo — best accuracy (16GB+ recommended)
</option>
```

### Acceptance Criteria

- [ ] Model xuất hiện trong Settings dropdown với label rõ ràng
- [ ] Warning/disable hiện khi RAM < 12GB
- [ ] Model download, load, transcribe thành công trên 16GB machine
- [ ] AdaptiveModelQuality không tự downgrade từ `large-v3-turbo` khi RAM đủ

---

## Thứ tự triển khai đề xuất

```
Tuần 1:   P1 — Core ML (impact lớn nhất, effort thấp nhất, không break gì)
Tuần 2:   P2 — Opus-MT model upgrade (benchmark trước, 1-line change nếu model tồn tại)
Tuần 3–4: P3 — Silero VAD refactor (thay đổi lớn, cần test kỹ)
Backlog:  P4 — large-v3-turbo (chỉ prioritize khi có user feedback về accuracy)
```

---

## Ghi chú kỹ thuật

### Core ML — first-run latency (P1)
whisper.cpp docs: *"The first run on a device is slow, since the ANE service compiles the Core ML model to some device-specific format. Next runs are faster."*

→ Cần thêm UX indicator: "Optimizing Whisper for your Mac (one-time, ~30s)..." khi detect lần đầu tiên.

### Self-convert Opus-MT tc-big sang ONNX (P2 — nếu cần)
```bash
pip install optimum[exporters]
optimum-cli export onnx \
  --model Helsinki-NLP/opus-mt-tc-big-en-vi \
  --task translation \
  ./onnx-opus-mt-tc-big-en-vi/
```
Sau đó host model locally hoặc upload lên HuggingFace Hub riêng.

### whisper.cpp VAD API check (P3)
Verify trước khi bắt đầu P3 bằng cách kiểm tra `whisper_full_params` struct trong `native/whisper/vendor/whisper.cpp/include/whisper.h`:
```c
// Tìm các field:
bool vad;
const char * vad_model_path;
float vad_thold;
float vad_freq_thold;
```
Nếu có → N-API addon chỉ cần expose các field này. Nếu không → phải build lại whisper.cpp phiên bản mới hơn.
