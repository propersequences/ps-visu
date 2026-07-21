/**
 * Meters state & helpers – receives data from Worklet and maintains display values
 */

export class MeterState {
  constructor() {
    this.momentary = -Infinity;
    this.shortTerm = -Infinity;
    this.integrated = -Infinity;
    this.truePeak = -Infinity;
    this.rmsL = 0;
    this.rmsR = 0;
    this.peakL = 0;
    this.peakR = 0;
    this.peakHoldL = 0;
    this.peakHoldR = 0;
    this.correlation = 0;
    this.corrSmoothed = 0;
    this.midSideRatio = 0;
    this.clipCount = 0;
    this.crest = 0;
    this.centroid = 0;
  }

  updateFromWorklet(data) {
    this.momentary = data.momentary;
    this.shortTerm = data.shortTerm;
    this.integrated = data.integrated;
    this.truePeak = data.truePeak;
    this.rmsL = data.rmsL;
    this.rmsR = data.rmsR;
    this.peakL = data.peakL;
    this.peakR = data.peakR;
    this.correlation = data.correlation;
    this.corrSmoothed += (data.correlation - this.corrSmoothed) * 0.25;
    this.midSideRatio = data.midSideRatio;
    this.clipCount = data.clip;

    this.peakHoldL = Math.max(this.peakHoldL * 0.97, this.peakL);
    this.peakHoldR = Math.max(this.peakHoldR * 0.97, this.peakR);

    const pk = Math.max(this.peakL, this.peakR);
    const rms = Math.max(this.rmsL, this.rmsR);
    this.crest = pk > 1e-9 ? 20 * Math.log10(pk / Math.max(rms, 1e-9)) : 0;
  }

  reset() {
    this.momentary = -Infinity;
    this.shortTerm = -Infinity;
    this.integrated = -Infinity;
    this.truePeak = -Infinity;
    this.rmsL = this.rmsR = 0;
    this.peakL = this.peakR = 0;
    this.peakHoldL = this.peakHoldR = 0;
    this.correlation = 0;
    this.corrSmoothed = 0;
    this.midSideRatio = 0;
    this.clipCount = 0;
    this.crest = 0;
  }
}

export function dBFS(v) {
  return v <= 0.00001 ? '-INF' : (20 * Math.log10(v)).toFixed(1);
}

export function fmtLUFS(v) {
  return isFinite(v) ? v.toFixed(1) : '--';
}
