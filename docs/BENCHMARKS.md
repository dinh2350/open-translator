# Open Translator — STT Benchmarks

> Benchmarked on: 2026-04-12
> Hardware: Apple M4, macOS
> whisper.cpp: Metal GPU + Flash Attention, 4 threads
> Audio: JFK sample (16kHz mono), synthetic silence/noise

## Results

| Model | GPU | Audio | Duration | P50 | P95 | P99 | Mean |
|-------|-----|-------|----------|-----|-----|-----|------|
| tiny.en | Metal | silence-1s | 1s | 29.8ms | 32.4ms | 32.4ms | 30.2ms |
| tiny.en | Metal | silence-3s | 3s | 30.5ms | 30.9ms | 30.9ms | 30.5ms |
| tiny.en | Metal | noise-3s | 3s | 34.5ms | 35.1ms | 35.1ms | 34.6ms |
| tiny.en | Metal | jfk-3s | 3s | 37.1ms | 37.3ms | 37.3ms | 37.0ms |
| tiny.en | Metal | jfk-5s | 5s | 40.5ms | 42.2ms | 42.2ms | 40.8ms |
| tiny.en | Metal | jfk-full-11s | 11s | 66.0ms | 66.1ms | 66.1ms | 65.9ms |
| base.en | Metal | silence-1s | 1s | 54.0ms | 54.1ms | 54.1ms | 54.0ms |
| base.en | Metal | silence-3s | 3s | 56.6ms | 57.0ms | 57.0ms | 56.6ms |
| base.en | Metal | noise-3s | 3s | 61.0ms | 61.2ms | 61.2ms | 60.9ms |
| base.en | Metal | jfk-3s | 3s | 68.9ms | 69.3ms | 69.3ms | 69.0ms |
| base.en | Metal | jfk-5s | 5s | 71.8ms | 71.9ms | 71.9ms | 71.8ms |
| base.en | Metal | jfk-full-11s | 11s | 106.6ms | 106.8ms | 106.8ms | 106.6ms |
| tiny.en | CPU | jfk-3s-cpu | 3s | 101.1ms | 108.2ms | 108.2ms | 102.8ms |
| base.en | CPU | jfk-3s-cpu | 3s | 203.3ms | 205.3ms | 205.3ms | 202.2ms |

## Acceptance Criteria

| Criterion | Target | Actual | Result |
|-----------|--------|--------|--------|
| base.en P95 (3s audio) | < 500ms | 69.3ms | **PASS** (7.2x margin) |
| tiny.en P95 (3s audio) | < 250ms | 37.3ms | **PASS** (6.7x margin) |
| Metal GPU vs CPU (base.en, 3s) | GPU faster | 68.9ms vs 203.3ms | **PASS** (2.9x speedup) |

## Key Observations

- **Metal GPU provides ~2.9x speedup** over CPU-only for base.en on 3s audio
- **Both models are well within latency budget** — even base.en at 11s audio is only 107ms
- **Latency scales sub-linearly** with audio duration (11s audio ≠ 11x cost of 1s)
- **Model load time**: tiny.en ~74ms, base.en ~55ms (cached)
- **Memory**: ~321MB RSS during benchmark (includes model + Node.js overhead)
- Performance far exceeds targets — could use **base.en as default** instead of tiny.en for better accuracy

## Reproduce

```bash
npx tsx scripts/benchmark-stt.ts
```
