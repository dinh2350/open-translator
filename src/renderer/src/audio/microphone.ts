import processorUrl from './audio-worklet-processor.js?url';

type AudioDataCallback = (pcm: Float32Array) => void;

export class MicrophoneCapture {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private silentGain: GainNode | null = null;
  private callback: AudioDataCallback | null = null;

  get sampleRate(): number {
    return this.audioContext?.sampleRate ?? 48000;
  }

  get isActive(): boolean {
    return this.audioContext?.state === 'running';
  }

  async start(deviceId?: string): Promise<void> {
    if (this.audioContext) {
      this.stop();
    }

    this.audioContext = new AudioContext({ sampleRate: 48000 });
    await this.audioContext.audioWorklet.addModule(processorUrl);

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-capture-processor');

    this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
      this.callback?.(event.data);
    };

    // Connect source → worklet → silent gain → destination
    // The destination connection keeps the audio graph active
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
  }

  stop(): void {
    this.workletNode?.disconnect();
    this.sourceNode?.disconnect();
    this.silentGain?.disconnect();

    this.stream?.getTracks().forEach((track) => track.stop());

    if (this.audioContext?.state !== 'closed') {
      this.audioContext?.close();
    }

    this.workletNode = null;
    this.sourceNode = null;
    this.silentGain = null;
    this.stream = null;
    this.audioContext = null;
  }

  onAudioData(callback: AudioDataCallback): void {
    this.callback = callback;
  }

  static async listDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  }
}
