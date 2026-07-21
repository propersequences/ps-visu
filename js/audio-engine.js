/**
 * Audio Engine – context, Worklet, sources, mic, A/B
 */

export class AudioEngine {
  constructor({ onMetrics, onEnded }) {
    this.ctx = null;
    this.workletNode = null;
    this.gain = null;
    this.analyser = null;
    this.source = null;
    this.bufferA = null;
    this.bufferB = null;
    this.activeBuffer = 'A';
    this.isPlaying = false;
    this.startTime = 0;
    this.pausedAt = 0;
    this.duration = 0;
    this.onMetrics = onMetrics;
    this.onEnded = onEnded;
    this.micStream = null;
  }

  async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    await this.ctx.audioWorklet.addModule('./worklet/analysis-processor.js');
    this.workletNode = new AudioWorkletNode(this.ctx, 'analysis-processor');
    this.workletNode.port.onmessage = (e) => {
      if (e.data.type === 'metrics' && this.onMetrics) this.onMetrics(e.data);
    };

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0.8;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.8;

    this.workletNode.connect(this.gain);
    this.gain.connect(this.analyser);
    this.gain.connect(this.ctx.destination);
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setVolume(v) {
    if (this.gain) this.gain.gain.value = v;
  }

  setFFTSize(size) {
    if (this.analyser) this.analyser.fftSize = size;
  }

  async loadBuffer(arrayBuffer, slot = 'A') {
    await this.init();
    const buf = await this.ctx.decodeAudioData(arrayBuffer);
    if (slot === 'A') this.bufferA = buf;
    else this.bufferB = buf;
    if (this.activeBuffer === slot) {
      this.duration = buf.duration;
      this.pausedAt = 0;
    }
    return buf;
  }

  switchAB() {
    this.activeBuffer = this.activeBuffer === 'A' ? 'B' : 'A';
    const buf = this.activeBuffer === 'A' ? this.bufferA : this.bufferB;
    if (buf) {
      this.duration = buf.duration;
      this.pausedAt = 0;
      if (this.isPlaying) {
        this.stop();
        this.play();
      }
    }
    return this.activeBuffer;
  }

  play() {
    if (!this.ctx) return;
    const buf = this.activeBuffer === 'A' ? this.bufferA : this.bufferB;
    if (!buf) return;

    this.stopSourceOnly();

    this.source = this.ctx.createBufferSource();
    this.source.buffer = buf;
    this.source.connect(this.workletNode);

    this.source.onended = () => {
      this.isPlaying = false;
      if (this.onEnded) this.onEnded();
    };

    const offset = this.pausedAt;
    this.source.start(0, offset);
    this.startTime = this.ctx.currentTime;
    this.isPlaying = true;
  }

  stopSourceOnly() {
    if (this.source) {
      try { this.source.stop(); } catch (_) {}
      this.source.disconnect();
      this.source = null;
    }
  }

  pause() {
    if (!this.isPlaying) return;
    this.pausedAt = Math.min(this.ctx.currentTime - this.startTime + this.pausedAt, this.duration);
    this.stopSourceOnly();
    this.isPlaying = false;
  }

  stop() {
    this.pause();
    this.pausedAt = 0;
  }

  seek(ratio) {
    this.pausedAt = ratio * this.duration;
    if (this.isPlaying) {
      this.pause();
      this.play();
    }
  }

  getCurrentTime() {
    if (!this.isPlaying) return this.pausedAt;
    return Math.min(this.ctx.currentTime - this.startTime + this.pausedAt, this.duration);
  }

  async startMic() {
    await this.init();
    await this.resume();
    this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const micSource = this.ctx.createMediaStreamSource(this.micStream);
    micSource.connect(this.workletNode);
    this.isPlaying = true;
    return true;
  }

  stopMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }

  resetMeters() {
    if (this.workletNode) this.workletNode.port.postMessage('reset');
  }

  getAnalyser() {
    return this.analyser;
  }

  getSampleRate() {
    return this.ctx ? this.ctx.sampleRate : 44100;
  }
}
