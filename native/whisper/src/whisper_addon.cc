#include <napi.h>
#include <whisper.h>

#include <chrono>
#include <mutex>
#include <string>
#include <vector>

// ─── Async transcription worker ──────────────────────────────────────────────

struct TranscribeResult {
  std::string text;
  struct Segment {
    int64_t start_ms;
    int64_t end_ms;
    std::string text;
  };
  std::vector<Segment> segments;
  std::string language;
  double processing_time_ms;
  std::string error;
};

class TranscribeWorker : public Napi::AsyncWorker {
public:
  TranscribeWorker(Napi::Env env, whisper_context* ctx,
                   std::vector<float> samples, const std::string& language,
                   int n_threads)
      : Napi::AsyncWorker(env),
        deferred_(Napi::Promise::Deferred::New(env)),
        ctx_(ctx),
        samples_(std::move(samples)),
        language_(language),
        n_threads_(n_threads) {}

  Napi::Promise::Deferred& Deferred() { return deferred_; }

  void Execute() override {
    auto t0 = std::chrono::high_resolution_clock::now();

    struct whisper_full_params params =
        whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.n_threads = n_threads_;
    params.print_progress = false;
    params.print_realtime = false;
    params.print_special = false;
    params.print_timestamps = false;
    params.single_segment = false;
    params.no_timestamps = false;
    params.language = language_.empty() ? "auto" : language_.c_str();
    params.translate = false;
    params.suppress_blank = true;
    params.suppress_nst = true;

    int ret =
        whisper_full(ctx_, params, samples_.data(), (int)samples_.size());

    if (ret != 0) {
      result_.error = "whisper_full failed with code " + std::to_string(ret);
      return;
    }

    int n_segments = whisper_full_n_segments(ctx_);
    for (int i = 0; i < n_segments; i++) {
      const char* seg_text = whisper_full_get_segment_text(ctx_, i);
      int64_t t0_seg = whisper_full_get_segment_t0(ctx_, i);  // in 10ms units
      int64_t t1_seg = whisper_full_get_segment_t1(ctx_, i);

      result_.segments.push_back(
          {t0_seg * 10, t1_seg * 10, seg_text ? seg_text : ""});
    }

    // Full text
    std::string full_text;
    for (auto& seg : result_.segments) {
      full_text += seg.text;
    }
    result_.text = full_text;

    // Language detection
    int lang_id = whisper_full_lang_id(ctx_);
    if (lang_id >= 0) {
      result_.language = whisper_lang_str(lang_id);
    }

    auto t1 = std::chrono::high_resolution_clock::now();
    result_.processing_time_ms =
        std::chrono::duration<double, std::milli>(t1 - t0).count();
  }

  void OnOK() override {
    Napi::Env env = Env();

    if (!result_.error.empty()) {
      deferred_.Reject(Napi::Error::New(env, result_.error).Value());
      return;
    }

    Napi::Object obj = Napi::Object::New(env);
    obj.Set("text", Napi::String::New(env, result_.text));
    obj.Set("language", Napi::String::New(env, result_.language));
    obj.Set("processingTimeMs", Napi::Number::New(env, result_.processing_time_ms));

    Napi::Array segments = Napi::Array::New(env, result_.segments.size());
    for (size_t i = 0; i < result_.segments.size(); i++) {
      Napi::Object seg = Napi::Object::New(env);
      seg.Set("start", Napi::Number::New(env, (double)result_.segments[i].start_ms));
      seg.Set("end", Napi::Number::New(env, (double)result_.segments[i].end_ms));
      seg.Set("text", Napi::String::New(env, result_.segments[i].text));
      segments.Set((uint32_t)i, seg);
    }
    obj.Set("segments", segments);

    deferred_.Resolve(obj);
  }

  void OnError(const Napi::Error& e) override {
    deferred_.Reject(e.Value());
  }

private:
  Napi::Promise::Deferred deferred_;
  whisper_context* ctx_;
  std::vector<float> samples_;
  std::string language_;
  int n_threads_;
  TranscribeResult result_;
};

// ─── WhisperModel class ─────────────────────────────────────────────────────

class WhisperModel : public Napi::ObjectWrap<WhisperModel> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "WhisperModel",
        {
            InstanceMethod("transcribe", &WhisperModel::Transcribe),
            InstanceMethod("free", &WhisperModel::Free),
            InstanceMethod("isLoaded", &WhisperModel::IsLoaded),
        });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("WhisperModel", func);
    return exports;
  }

  WhisperModel(const Napi::CallbackInfo& info)
      : Napi::ObjectWrap<WhisperModel>(info), ctx_(nullptr) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "Expected model path as first argument")
          .ThrowAsJavaScriptException();
      return;
    }

    std::string model_path = info[0].As<Napi::String>().Utf8Value();

    bool use_gpu = true;
    int n_threads = 4;

    if (info.Length() >= 2 && info[1].IsObject()) {
      Napi::Object opts = info[1].As<Napi::Object>();
      if (opts.Has("gpu") && opts.Get("gpu").IsBoolean()) {
        use_gpu = opts.Get("gpu").As<Napi::Boolean>().Value();
      }
      if (opts.Has("nThreads") && opts.Get("nThreads").IsNumber()) {
        n_threads = opts.Get("nThreads").As<Napi::Number>().Int32Value();
      }
    }

    n_threads_ = n_threads;

    struct whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = use_gpu;
    cparams.flash_attn = true;

    ctx_ = whisper_init_from_file_with_params(model_path.c_str(), cparams);

    if (!ctx_) {
      Napi::Error::New(env, "Failed to load whisper model from: " + model_path)
          .ThrowAsJavaScriptException();
      return;
    }
  }

  ~WhisperModel() { Cleanup(); }

private:
  Napi::Value Transcribe(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (!ctx_) {
      Napi::Error::New(env, "Model has been freed").ThrowAsJavaScriptException();
      return env.Undefined();
    }

    if (info.Length() < 1 || !info[0].IsTypedArray()) {
      Napi::TypeError::New(env, "Expected Float32Array as first argument")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    Napi::Float32Array audio = info[0].As<Napi::Float32Array>();
    size_t n_samples = audio.ElementLength();

    if (n_samples == 0) {
      Napi::Error::New(env, "Audio buffer is empty")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    // Copy samples to a vector (worker needs its own copy for thread safety)
    std::vector<float> samples(audio.Data(), audio.Data() + n_samples);

    // Optional language parameter
    std::string language = "en";
    if (info.Length() >= 2 && info[1].IsObject()) {
      Napi::Object opts = info[1].As<Napi::Object>();
      if (opts.Has("language") && opts.Get("language").IsString()) {
        language = opts.Get("language").As<Napi::String>().Utf8Value();
      }
    }

    auto* worker =
        new TranscribeWorker(env, ctx_, std::move(samples), language, n_threads_);
    worker->Queue();
    return worker->Deferred().Promise();
  }

  Napi::Value Free(const Napi::CallbackInfo& info) {
    Cleanup();
    return info.Env().Undefined();
  }

  Napi::Value IsLoaded(const Napi::CallbackInfo& info) {
    return Napi::Boolean::New(info.Env(), ctx_ != nullptr);
  }

  void Cleanup() {
    if (ctx_) {
      whisper_free(ctx_);
      ctx_ = nullptr;
    }
  }

  whisper_context* ctx_;
  int n_threads_ = 4;
};

// ─── Module init ────────────────────────────────────────────────────────────

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  WhisperModel::Init(env, exports);
  return exports;
}

NODE_API_MODULE(whisper_addon, Init)
