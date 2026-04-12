/**
 * AudioWorklet processor that buffers PCM audio frames and sends
 * them to the main thread in chunks of 4096 samples (~85ms at 48kHz).
 *
 * Runs in a separate AudioWorklet thread — no imports allowed.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._bytesWritten = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono channel

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._bytesWritten] = channelData[i];
      this._bytesWritten++;

      if (this._bytesWritten >= this._bufferSize) {
        // Send a copy of the buffer to the main thread
        this.port.postMessage(this._buffer.slice(0));
        this._bytesWritten = 0;
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
