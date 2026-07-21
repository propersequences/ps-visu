/**
 * Canvas visualizers – goniometer restored to original v1 behaviour
 */

export class Visualizers {
  constructor(canvases) {
    this.main = canvases.main;
    this.chL = canvases.chL;
    this.chR = canvases.chR;
    this.radar = canvases.radar;
    this.currentView = 'spectrum';
    this.waterfallBuf = null;
    this.waterfallCtx = null;
    this.waveformPeaks = null;
    this.sr = 44100;
    this.forceRed = false;
  }

  setView(view) {
    this.currentView = view;
    if (view !== 'waterfall') this.waterfallBuf = null;
  }

  setSampleRate(sr) { this.sr = sr; }
  setWaveformPeaks(peaks) { this.waveformPeaks = peaks; }
  setForceRed(v) { this.forceRed = !!v; }

  resize() {
    [this.main, this.chL, this.chR, this.radar].forEach(c => {
      if (!c) return;
      const r = c.parentElement.getBoundingClientRect();
      c.width = r.width;
      c.height = r.height;
    });
    this.waterfallBuf = null;
  }

  getAccent() {
    return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  }

  drawMeter(canvas, val, hold) {
    const c = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    c.clearRect(0, 0, w, h);
    const db = 20 * Math.log10(Math.max(val, 0.0001));
    const minDb = -60;
    const fillH = Math.max(0, Math.min(1, (db - minDb) / -minDb)) * h;
    c.fillStyle = db > -1 ? 'var(--alert)' : this.getAccent();
    c.fillRect(0, h - fillH, w, fillH);
    const holdDb = 20 * Math.log10(Math.max(hold, 0.0001));
    const holdH = Math.max(0, Math.min(1, (holdDb - minDb) / -minDb)) * h;
    if (holdDb > minDb) {
      c.fillStyle = '#fff';
      c.fillRect(0, h - holdH - 2, w, 2);
    }
  }

  drawLissajous(tdL, tdR) {
    const c = this.radar.getContext('2d');
    const w = this.radar.width, h = this.radar.height;
    c.clearRect(0, 0, w, h);

    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(w / 2, 0); c.lineTo(w / 2, h);
    c.moveTo(0, h / 2); c.lineTo(w, h / 2);
    c.stroke();

    c.strokeStyle = this.forceRed ? '#ff003c' : this.getAccent();
    c.lineWidth = 1.5;
    c.beginPath();
    const len = tdL.length;
    let hasSignal = false;
    for (let i = 0; i < len; i += 4) {
      const l = (tdL[i] - 128) / 128;
      const r = (tdR[i] - 128) / 128;
      if (Math.abs(l) > 0.02 || Math.abs(r) > 0.02) hasSignal = true;
      const x = w / 2 + ((r - l) * 0.707) * (w / 2);
      const y = h / 2 - ((l + r) * 0.707) * (h / 2);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    if (hasSignal) c.stroke();
  }

  drawSpectrum(fd) {
    const c = this.main.getContext('2d');
    const w = this.main.width, h = this.main.height;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.lineWidth = 1;
    c.fillStyle = 'var(--txt-dim)';
    c.font = '10px var(--font)';
    const freqs = [100, 500, 1000, 5000, 10000];
    freqs.forEach(f => {
      const x = w * (Math.log10(f / 20) / Math.log10((this.sr / 2) / 20));
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke();
      c.fillText(f >= 1000 ? (f / 1000) + 'K' : f, x + 4, 14);
    });

    c.beginPath();
    const n = fd.length;
    let sum = 0, wsum = 0;
    for (let i = 0; i < n; i++) {
      const f = Math.max(20, (i / n) * (this.sr / 2));
      const x = w * (Math.log10(f / 20) / Math.log10((this.sr / 2) / 20));
      const y = h * (1 - fd[i] / 255);
      sum += fd[i]; wsum += fd[i] * i;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.lineTo(w, h); c.lineTo(0, h); c.closePath();
    const acc = this.getAccent();
    const grad = c.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, acc); grad.addColorStop(1, 'transparent');
    c.fillStyle = grad; c.globalAlpha = 0.2; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = acc; c.stroke();
    return sum > 0 ? (wsum / sum) * (this.sr / 2 / n) : 0;
  }

  drawBars(fd) {
    const c = this.main.getContext('2d');
    const w = this.main.width, h = this.main.height;
    c.clearRect(0, 0, w, h);
    const acc = this.getAccent();
    const barCount = 64;
    const step = Math.floor(fd.length / barCount);
    const gap = 2;
    const barW = (w / barCount) - gap;
    let sum = 0, wsum = 0;
    for (let i = 0; i < barCount; i++) {
      let v = 0;
      for (let j = 0; j < step; j++) v += fd[i * step + j] || 0;
      v /= step;
      sum += v; wsum += v * i * step;
      const barH = (v / 255) * h;
      const x = i * (barW + gap);
      const grad = c.createLinearGradient(0, h - barH, 0, h);
      grad.addColorStop(0, acc); grad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = grad;
      c.fillRect(x, h - barH, barW, barH);
    }
    return sum > 0 ? (wsum / sum) * (this.sr / 2 / fd.length) : 0;
  }

  drawRadial(fd) {
    const c = this.main.getContext('2d');
    const w = this.main.width, h = this.main.height;
    c.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const baseR = Math.min(w, h) * 0.18;
    const maxR = Math.min(w, h) * 0.42;
    const acc = this.getAccent();
    const n = fd.length, bars = 96, step = Math.floor(n / bars);
    let sum = 0, wsum = 0;

    c.strokeStyle = 'rgba(255,255,255,0.06)';
    c.lineWidth = 1;
    c.beginPath(); c.arc(cx, cy, baseR, 0, Math.PI * 2); c.stroke();

    c.strokeStyle = acc; c.lineWidth = 2;
    for (let i = 0; i < bars; i++) {
      let v = 0;
      for (let j = 0; j < step; j++) v += fd[i * step + j] || 0;
      v /= step;
      sum += v; wsum += v * i * step;
      const ang = (i / bars) * Math.PI * 2;
      const len = baseR + (v / 255) * (maxR - baseR);
      const x1 = cx + Math.cos(ang) * baseR, y1 = cy + Math.sin(ang) * baseR;
      const x2 = cx + Math.cos(ang) * len, y2 = cy + Math.sin(ang) * len;
      c.globalAlpha = 0.35 + (v / 255) * 0.65;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
    c.globalAlpha = 1;
    return sum > 0 ? (wsum / sum) * (this.sr / 2 / n) : 0;
  }

  drawWaterfall(fd) {
    const c = this.main.getContext('2d');
    const w = this.main.width, h = this.main.height;
    if (!this.waterfallBuf || this.waterfallBuf.width !== w || this.waterfallBuf.height !== h) {
      this.waterfallBuf = document.createElement('canvas');
      this.waterfallBuf.width = w; this.waterfallBuf.height = h;
      this.waterfallCtx = this.waterfallBuf.getContext('2d');
      this.waterfallCtx.fillStyle = '#000';
      this.waterfallCtx.fillRect(0, 0, w, h);
    }
    this.waterfallCtx.drawImage(this.waterfallBuf, -1, 0);
    const n = fd.length;
    const accRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
    let sum = 0, wsum = 0;
    for (let y = 0; y < h; y++) {
      const idx = Math.floor((1 - y / h) * n);
      const v = fd[idx] || 0;
      sum += v; wsum += v * idx;
      this.waterfallCtx.fillStyle = `rgba(${accRgb}, ${(v / 255).toFixed(3)})`;
      this.waterfallCtx.fillRect(w - 1, y, 1, 1);
    }
    c.clearRect(0, 0, w, h);
    c.drawImage(this.waterfallBuf, 0, 0);
    return sum > 0 ? (wsum / sum) * (this.sr / 2 / n) : 0;
  }

  drawWaveform(ratio) {
    const c = this.main.getContext('2d');
    const w = this.main.width, h = this.main.height;
    c.clearRect(0, 0, w, h);
    if (!this.waveformPeaks) {
      c.fillStyle = 'var(--txt-dim)';
      c.fillText('[ WAITING_DATABLOCK ]', 20, 20);
      return;
    }
    const p = this.waveformPeaks;
    const len = p.length, mid = h / 2;
    c.beginPath(); c.moveTo(0, mid);
    for (let i = 0; i < len; i++) c.lineTo((i / len) * w, mid - p[i] * (h / 2.1));
    for (let i = len - 1; i >= 0; i--) c.lineTo((i / len) * w, mid + p[i] * (h / 2.1));
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
    c.strokeStyle = this.getAccent(); c.stroke();
    const rx = ratio * w;
    c.beginPath(); c.moveTo(rx, 0); c.lineTo(rx, h);
    c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
  }

  render(analyser, anaL, anaR, meters, ratio) {
    if (this.currentView === 'waveform') {
      this.drawWaveform(ratio);
    } else if (analyser) {
      const fd = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(fd);

      let centroid = 0;
      if (this.currentView === 'spectrum') centroid = this.drawSpectrum(fd);
      else if (this.currentView === 'bars') centroid = this.drawBars(fd);
      else if (this.currentView === 'radial') centroid = this.drawRadial(fd);
      else if (this.currentView === 'waterfall') centroid = this.drawWaterfall(fd);

      this.drawMeter(this.chL, meters.rmsL, meters.peakHoldL);
      this.drawMeter(this.chR, meters.rmsR, meters.peakHoldR);

      if (anaL && anaR) {
        const tdL = new Uint8Array(anaL.fftSize);
        const tdR = new Uint8Array(anaR.fftSize);
        anaL.getByteTimeDomainData(tdL);
        anaR.getByteTimeDomainData(tdR);
        this.drawLissajous(tdL, tdR);
      }

      return centroid;
    }

    this.drawMeter(this.chL, meters.rmsL, meters.peakHoldL);
    this.drawMeter(this.chR, meters.rmsR, meters.peakHoldR);
    if (anaL && anaR) {
      const tdL = new Uint8Array(anaL.fftSize);
      const tdR = new Uint8Array(anaR.fftSize);
      anaL.getByteTimeDomainData(tdL);
      anaR.getByteTimeDomainData(tdR);
      this.drawLissajous(tdL, tdR);
    }
    return 0;
  }
}
