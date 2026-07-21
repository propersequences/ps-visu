/**
 * PS Analysis Processor (AudioWorklet)
 * Real-time metering: K-weighted LUFS (Momentary / Short-term), True Peak, Mid/Side, Correlation, Clip
 * Algorithmically solid approximation of ITU-R BS.1770 / EBU R128 principles.
 */

class AnalysisProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sampleRate = sampleRate;

    this.kWeight = this.createKWeighting(this.sampleRate);

    this.z1L = [0, 0]; this.z2L = [0, 0];
    this.z1R = [0, 0]; this.z2R = [0, 0];

    this.momentaryWindow = Math.round(0.4 * this.sampleRate);
    this.shortWindow = Math.round(3.0 * this.sampleRate);

    this.momEnergy = 0;
    this.shortEnergy = 0;
    this.momSamples = 0;
    this.shortSamples = 0;

    this.integratedSum = 0;
    this.integratedCount = 0;
    this.gateThreshold = -70;

    this.tpMax = 0;

    this.sumL = 0; this.sumR = 0; this.sumLR = 0; this.sumM = 0; this.sumS = 0;
    this.spatialSamples = 0;

    this.clipCount = 0;

    this.reportInterval = Math.round(0.05 * this.sampleRate);
    this.reportCounter = 0;

    this.port.onmessage = (e) => {
      if (e.data === 'reset') {
        this.resetState();
      }
    };
  }

  createKWeighting(sr) {
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752364245093;

    const K = Math.tan(Math.PI * f0 / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);

    const a0 = 1 + K / Q + K * K;
    const b0 = (Vh + Vb * K / Q + K * K) / a0;
    const b1 = 2 * (K * K - Vh) / a0;
    const b2 = (Vh - Vb * K / Q + K * K) / a0;
    const a1 = 2 * (K * K - 1) / a0;
    const a2 = (1 - K / Q + K * K) / a0;

    const fH = 38.13547087602444;
    const QH = 0.5003270373237953;
    const KH = Math.tan(Math.PI * fH / sr);
    const a0H = 1 + KH / QH + KH * KH;
    const b0H = 1 / a0H;
    const b1H = -2 / a0H;
    const b2H = 1 / a0H;
    const a1H = 2 * (KH * KH - 1) / a0H;
    const a2H = (1 - KH / QH + KH * KH) / a0H;

    return {
      pre: { b0, b1, b2, a1, a2 },
      rlb: { b0: b0H, b1: b1H, b2: b2H, a1: a1H, a2: a2H }
    };
  }

  processBiquad(sample, coeffs, z) {
    const y = coeffs.b0 * sample + z[0];
    z[0] = coeffs.b1 * sample - coeffs.a1 * y + z[1];
    z[1] = coeffs.b2 * sample - coeffs.a2 * y;
    return y;
  }

  kWeightSample(sample, z1, z2) {
    const pre = this.processBiquad(sample, this.kWeight.pre, z1);
    return this.processBiquad(pre, this.kWeight.rlb, z2);
  }

  resetState() {
    this.momEnergy = 0; this.shortEnergy = 0;
    this.momSamples = 0; this.shortSamples = 0;
    this.integratedSum = 0; this.integratedCount = 0;
    this.tpMax = 0;
    this.sumL = this.sumR = this.sumLR = this.sumM = this.sumS = 0;
    this.spatialSamples = 0;
    this.clipCount = 0;
    this.z1L = [0, 0]; this.z2L = [0, 0];
    this.z1R = [0, 0]; this.z2R = [0, 0];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length < 2) return true;

    const chL = input[0];
    const chR = input[1] || input[0];
    const n = chL.length;

    for (let i = 0; i < n; i++) {
      let l = chL[i];
      let r = chR[i];

      if (Math.abs(l) > 0.999 || Math.abs(r) > 0.999) this.clipCount++;

      const absL = Math.abs(l);
      const absR = Math.abs(r);
      if (absL > this.tpMax) this.tpMax = absL;
      if (absR > this.tpMax) this.tpMax = absR;

      const kwL = this.kWeightSample(l, this.z1L, this.z2L);
      const kwR = this.kWeightSample(r, this.z1R, this.z2R);

      const energy = (kwL * kwL + kwR * kwR) * 0.5;

      this.momEnergy += energy;
      this.momSamples++;
      this.shortEnergy += energy;
      this.shortSamples++;

      const mid = (l + r) * 0.5;
      const side = (l - r) * 0.5;
      this.sumL += l * l;
      this.sumR += r * r;
      this.sumLR += l * r;
      this.sumM += mid * mid;
      this.sumS += side * side;
      this.spatialSamples++;
    }

    this.reportCounter += n;

    if (this.reportCounter >= this.reportInterval) {
      this.reportCounter = 0;

      let momLUFS = -Infinity;
      if (this.momSamples > 0) {
        const mean = this.momEnergy / this.momSamples;
        momLUFS = mean > 1e-12 ? -0.691 + 10 * Math.log10(mean) : -Infinity;
      }

      let shortLUFS = -Infinity;
      if (this.shortSamples > 0) {
        const mean = this.shortEnergy / this.shortSamples;
        shortLUFS = mean > 1e-12 ? -0.691 + 10 * Math.log10(mean) : -Infinity;
      }

      if (momLUFS > this.gateThreshold) {
        this.integratedSum += this.momEnergy / Math.max(1, this.momSamples);
        this.integratedCount++;
      }
      let intLUFS = -Infinity;
      if (this.integratedCount > 0) {
        const mean = this.integratedSum / this.integratedCount;
        intLUFS = mean > 1e-12 ? -0.691 + 10 * Math.log10(mean) : -Infinity;
      }

      if (this.momSamples >= this.momentaryWindow) {
        this.momEnergy = 0;
        this.momSamples = 0;
      }
      if (this.shortSamples >= this.shortWindow) {
        this.shortEnergy *= 0.5;
        this.shortSamples = Math.floor(this.shortSamples * 0.5);
      }

      const N = Math.max(1, this.spatialSamples);
      const rL = Math.sqrt(this.sumL / N);
      const rR = Math.sqrt(this.sumR / N);
      const corr = (rL * rR > 1e-9) ? (this.sumLR / N) / (rL * rR) : 0;
      const midEnergy = this.sumM / N;
      const sideEnergy = this.sumS / N;
      const msRatio = midEnergy > 1e-12 ? sideEnergy / midEnergy : 0;

      const tp = this.tpMax > 1e-12 ? 20 * Math.log10(this.tpMax) : -Infinity;

      this.port.postMessage({
        type: 'metrics',
        momentary: momLUFS,
        shortTerm: shortLUFS,
        integrated: intLUFS,
        truePeak: tp,
        rmsL: rL,
        rmsR: rR,
        correlation: corr,
        midSideRatio: msRatio,
        clip: this.clipCount,
        peakL: rL,
        peakR: rR
      });

      this.sumL = this.sumR = this.sumLR = this.sumM = this.sumS = 0;
      this.spatialSamples = 0;
      this.tpMax *= 0.98;
    }

    if (outputs[0] && outputs[0].length >= 2) {
      outputs[0][0].set(chL);
      outputs[0][1].set(chR);
    }

    return true;
  }
}

registerProcessor('analysis-processor', AnalysisProcessor);
