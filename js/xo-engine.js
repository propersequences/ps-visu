(function(){
'use strict';

const UI = {
  canvas: document.getElementById('mainCanvas'),
  chL: document.getElementById('chLCanvas'),
  chR: document.getElementById('chRCanvas'),
  radar: document.getElementById('stereoRadar'),
  phaseLow: document.getElementById('phaseLow'),
  time: document.getElementById('timeDisplay'),
  playBtn: document.getElementById('playBtn'),
  slider: document.getElementById('progressSlider'),
  playlist: document.getElementById('playlistContainer')
};

function resize() {
  [UI.canvas, UI.chL, UI.chR, UI.radar, UI.phaseLow].forEach(c => {
    if (!c) return;
    const r = c.parentElement.getBoundingClientRect();
    c.width = r.width; c.height = r.height;
  });
  waterfallBuf = null;
}
window.addEventListener('resize', resize);

let ctx = null, buffer = null, source = null;
let masterGain = null;
let bus = null;
let splitter = null, anaL = null, anaR = null, anaMain = null;
let isPlaying = false, startTime = 0, pausedAt = 0, duration = 0, sr = 44100;
let animId = null, currentView = 'spectrum';
let pkHoldL = 0, pkHoldR = 0, wavePeaks = null, corrSmooth = 0, lastDom = 0;
let clipCounter = 0, maxPeakSession = 0, rmsAcc = 0, rmsCount = 0;
let waterfallBuf = null, waterfallCtx = null;
let trackQueue = [], activeIdx = -1;
let monoEnabled = false, bassMonoEnabled = false, bassMonoFreq = 120;
let graphReady = false;

let dryGain, gainLow, gainMid, gainHigh;
let anaLowL, anaLowR, anaMidL, anaMidR, anaHighL, anaHighR;
let listenMode = 'bypass';
let monoNode = null;

function getAcc() { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); }
function dBFS(v) { return v <= 0.00001 ? '-INF' : (20 * Math.log10(v)).toFixed(1); }
function format(s) {
  if (!s || !isFinite(s)) return '00:00';
  const m = Math.floor(s / 60), sc = Math.floor(s % 60);
  return m.toString().padStart(2,'0') + ':' + sc.toString().padStart(2,'0');
}

document.getElementById('accentPicker').addEventListener('input', e => {
  const hex = e.target.value;
  document.documentElement.style.setProperty('--accent', hex);
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  document.documentElement.style.setProperty('--accent-rgb', r+','+g+','+b);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  e.target.classList.add('active');
  currentView = e.target.dataset.view;
  if (currentView !== 'waterfall') waterfallBuf = null;
}));

document.getElementById('volSlider').addEventListener('input', e => {
  if (masterGain) masterGain.gain.value = parseFloat(e.target.value);
});

document.getElementById('monoBtn').addEventListener('click', () => {
  monoEnabled = !monoEnabled;
  document.getElementById('monoBtn').classList.toggle('active', monoEnabled);
  if (isPlaying) restartFromPause();
});
document.getElementById('bassMonoBtn').addEventListener('click', () => {
  bassMonoEnabled = !bassMonoEnabled;
  document.getElementById('bassMonoBtn').classList.toggle('active', bassMonoEnabled);
});
document.getElementById('bassFreq').addEventListener('input', e => {
  bassMonoFreq = parseInt(e.target.value);
  document.getElementById('bassFreqLabel').textContent = bassMonoFreq + ' HZ';
});

function setListenMode(mode) {
  listenMode = mode;
  ['xoBypass','xoLow','xoMid','xoHigh'].forEach(id => document.getElementById(id).classList.remove('active'));
  const map = { bypass: 'xoBypass', low: 'xoLow', mid: 'xoMid', high: 'xoHigh' };
  document.getElementById(map[mode]).classList.add('active');
  if (!dryGain) return;
  const t = ctx.currentTime;
  const at = (g, v) => { if (g) g.gain.setTargetAtTime(v, t, 0.02); };
  if (mode === 'bypass') { at(dryGain,1); at(gainLow,0); at(gainMid,0); at(gainHigh,0); }
  else if (mode === 'low') { at(dryGain,0); at(gainLow,1); at(gainMid,0); at(gainHigh,0); }
  else if (mode === 'mid') { at(dryGain,0); at(gainLow,0); at(gainMid,1); at(gainHigh,0); }
  else if (mode === 'high') { at(dryGain,0); at(gainLow,0); at(gainMid,0); at(gainHigh,1); }
}
document.getElementById('xoBypass').addEventListener('click', () => setListenMode('bypass'));
document.getElementById('xoLow').addEventListener('click', () => setListenMode('low'));
document.getElementById('xoMid').addEventListener('click', () => setListenMode('mid'));
document.getElementById('xoHigh').addEventListener('click', () => setListenMode('high'));

document.getElementById('exportBtn').addEventListener('click', () => {
  const lufs = rmsCount > 0 ? (-0.691 + 10 * Math.log10(rmsAcc / rmsCount)).toFixed(1) : null;
  const data = {
    maxPeak: maxPeakSession > 0 ? (20 * Math.log10(maxPeakSession)).toFixed(2) + ' dBFS' : '-INF',
    lufs: lufs !== null ? parseFloat(lufs) : null,
    clipping: maxPeakSession >= 0.99
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ps-trace-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

function initAudio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
}

function ensureGraph() {
  if (graphReady) return;
  initAudio();

  masterGain = ctx.createGain();
  masterGain.gain.value = parseFloat(document.getElementById('volSlider').value);

  bus = ctx.createGain();
  bus.gain.value = 1;

  splitter = ctx.createChannelSplitter(2);
  anaL = ctx.createAnalyser(); anaL.fftSize = 2048; anaL.smoothingTimeConstant = 0.35;
  anaR = ctx.createAnalyser(); anaR.fftSize = 2048; anaR.smoothingTimeConstant = 0.35;
  anaMain = ctx.createAnalyser(); anaMain.fftSize = 4096; anaMain.smoothingTimeConstant = 0.8;

  bus.connect(splitter);
  splitter.connect(anaL, 0);
  splitter.connect(anaR, 1);
  bus.connect(anaMain);

  dryGain = ctx.createGain(); dryGain.gain.value = 1;
  bus.connect(dryGain);
  dryGain.connect(ctx.destination);

  const mkBand = (type, freq, Q) => {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = Q;
    const g = ctx.createGain(); g.gain.value = 0;
    bus.connect(f); f.connect(g); g.connect(ctx.destination);
    const sp = ctx.createChannelSplitter(2);
    g.connect(sp);
    const aL = ctx.createAnalyser(); aL.fftSize = 2048;
    const aR = ctx.createAnalyser(); aR.fftSize = 2048;
    sp.connect(aL, 0); sp.connect(aR, 1);
    return { filter: f, gain: g, anaL: aL, anaR: aR };
  };

  const low = mkBand('lowpass', 150, 0.7);
  gainLow = low.gain; anaLowL = low.anaL; anaLowR = low.anaR;

  const mid = mkBand('bandpass', 1500, 1.0);
  gainMid = mid.gain; anaMidL = mid.anaL; anaMidR = mid.anaR;

  const high = mkBand('highpass', 3000, 0.7);
  gainHigh = high.gain; anaHighL = high.anaL; anaHighR = high.anaR;

  graphReady = true;
  setListenMode(listenMode);
}

function stopSource() {
  if (source) {
    try { source.onended = null; source.stop(); } catch (_) {}
    try { source.disconnect(); } catch (_) {}
    source = null;
  }
}

function connectSource(src) {
  if (monoNode) {
    try { monoNode.disconnect(); } catch (_) {}
    monoNode = null;
  }

  if (monoEnabled) {
    const split = ctx.createChannelSplitter(2);
    const gL = ctx.createGain(); gL.gain.value = 0.5;
    const gR = ctx.createGain(); gR.gain.value = 0.5;
    const sum = ctx.createGain();
    sum.gain.value = 1;

    src.connect(split);
    split.connect(gL, 0);
    split.connect(gR, 1);
    gL.connect(sum);
    gR.connect(sum);

    const merger = ctx.createChannelMerger(2);
    sum.connect(merger, 0, 0);
    sum.connect(merger, 0, 1);
    merger.connect(masterGain);
    monoNode = merger;
  } else {
    src.connect(masterGain);
  }
  masterGain.connect(bus);
}

function restartFromPause() {
  if (!buffer) return;
  const wasPlaying = isPlaying;
  const pos = wasPlaying
    ? Math.min(ctx.currentTime - startTime + pausedAt, duration)
    : pausedAt;
  stopSource();
  isPlaying = false;
  pausedAt = pos;
  if (wasPlaying) startPlayback();
}

function startPlayback() {
  if (!buffer) return;
  ensureGraph();
  stopSource();

  source = ctx.createBufferSource();
  source.buffer = buffer;
  connectSource(source);

  source.onended = () => {
    if (!isPlaying) return;
    isPlaying = false;
    UI.playBtn.textContent = 'EXECUTE';
    UI.playBtn.classList.remove('active');
    pausedAt = duration;
    UI.slider.value = 1000;
    UI.time.textContent = format(duration) + ' / ' + format(duration);
    drawStatic(1);
    animId = null;

    if (activeIdx < trackQueue.length - 1) {
      loadTrack(activeIdx + 1, true);
    }
  };

  if (pausedAt >= duration) pausedAt = 0;
  source.start(0, pausedAt);
  startTime = ctx.currentTime;
  isPlaying = true;
  UI.playBtn.textContent = 'HALT';
  UI.playBtn.classList.add('active');
  if (!animId) requestAnimationFrame(engineLoop);
}

function playExec() {
  if (!buffer) return;
  initAudio();
  if (isPlaying) {
    pausedAt = Math.min(ctx.currentTime - startTime + pausedAt, duration);
    stopSource();
    isPlaying = false;
    UI.playBtn.textContent = 'EXECUTE';
    UI.playBtn.classList.remove('active');
    animId = null;
    drawStatic(Math.min(1, pausedAt / Math.max(duration, 0.001)));
  } else {
    startPlayback();
  }
}
UI.playBtn.addEventListener('click', playExec);

UI.slider.addEventListener('input', e => {
  if (!buffer) return;
  pausedAt = (e.target.value / 1000) * duration;
  if (isPlaying) {
    restartFromPause();
  } else {
    drawStatic(e.target.value / 1000);
    UI.time.textContent = format(pausedAt) + ' / ' + format(duration);
  }
});

document.getElementById('fileInput').addEventListener('change', e => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  trackQueue = trackQueue.concat(files);
  document.getElementById('queueCount').textContent = trackQueue.length + '_FILES';
  renderQueue();
  if (activeIdx === -1) loadTrack(0, false);
});

function renderQueue() {
  UI.playlist.innerHTML = '';
  if (!trackQueue.length) { UI.playlist.innerHTML = '<div class="empty">[ NO_ROUTING ]</div>'; return; }
  trackQueue.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'q-item' + (i === activeIdx ? ' active' : '');
    el.textContent = '[' + i.toString().padStart(2,'0') + '] ' + f.name.toUpperCase();
    el.onclick = () => loadTrack(i, true);
    UI.playlist.appendChild(el);
  });
}

function loadTrack(idx, autoPlay) {
  if (idx < 0 || idx >= trackQueue.length) return;
  activeIdx = idx; renderQueue();
  const file = trackQueue[idx];
  document.getElementById('fileName').textContent = file.name.toUpperCase();
  const reader = new FileReader();
  reader.onload = async ev => {
    initAudio();
    stopSource();
    isPlaying = false;
    animId = null;
    UI.playBtn.textContent = 'EXECUTE';
    UI.playBtn.classList.remove('active');
    try {
      buffer = await ctx.decodeAudioData(ev.target.result);
      pausedAt = 0; pkHoldL = 0; pkHoldR = 0; clipCounter = 0;
      maxPeakSession = 0; rmsAcc = 0; rmsCount = 0;
      document.getElementById('clipCount').textContent = '0';
      processData(buffer); resize();
      if (autoPlay) startPlayback();
    } catch (err) { console.error(err); }
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('nextBtn').addEventListener('click', () => {
  if (trackQueue.length) loadTrack((activeIdx + 1) % trackQueue.length, true);
});
document.getElementById('prevBtn').addEventListener('click', () => {
  if (trackQueue.length) loadTrack((activeIdx - 1 + trackQueue.length) % trackQueue.length, true);
});

function processData(buf) {
  sr = buf.sampleRate; duration = buf.duration;
  const chL = buf.getChannelData(0);
  const chR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : chL;
  const pixels = Math.max(800, UI.canvas.width || 1000);
  wavePeaks = new Float32Array(pixels);
  const block = Math.max(1, Math.floor(chL.length / pixels));
  for (let i = 0; i < pixels; i++) {
    let max = 0;
    const start = i * block, end = Math.min(start + block, chL.length);
    for (let j = start; j < end; j++) { const v = Math.abs(chL[j]); if (v > max) max = v; }
    wavePeaks[i] = max;
  }
  let sqL = 0, pkL = 0, sqR = 0, pkR = 0;
  for (let i = 0; i < chL.length; i++) {
    const aL = Math.abs(chL[i]), aR = Math.abs(chR[i]);
    if (aL > pkL) pkL = aL; if (aR > pkR) pkR = aR;
    sqL += chL[i]*chL[i]; sqR += chR[i]*chR[i];
  }
  document.getElementById('peakLR').textContent = dBFS(pkL) + ' / ' + dBFS(pkR);
  const rL = Math.sqrt(sqL / chL.length), rR = Math.sqrt(sqR / chR.length);
  document.getElementById('rmsLR').textContent = dBFS(rL) + ' / ' + dBFS(rR);
  const crest = pkL > 1e-12 ? 20 * Math.log10(pkL / Math.max(rL, 1e-9)) : 0;
  document.getElementById('drVal').textContent = crest.toFixed(1) + ' DB';
  const meanSq = (sqL + sqR) / (chL.length * 2);
  document.getElementById('lufsInt').textContent = meanSq > 1e-12 ? (-0.691 + 10 * Math.log10(meanSq)).toFixed(1) : '--';
  drawStatic(0);
}

function drawMeter(c, val, hold) {
  const c2 = c.getContext('2d'), w = c.width, h = c.height;
  c2.clearRect(0, 0, w, h);
  const db = 20 * Math.log10(Math.max(val, 0.0001));
  const fillH = Math.max(0, Math.min(1, (db + 60) / 60)) * h;
  c2.fillStyle = db > -1 ? 'var(--alert)' : getAcc();
  c2.fillRect(0, h - fillH, w, fillH);
  const holdH = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(hold, 0.0001)) + 60) / 60)) * h;
  if (holdH > 0) { c2.fillStyle = '#fff'; c2.fillRect(0, h - holdH - 2, w, 2); }
}

function pearson(a, b) {
  let sumA = 0, sumB = 0, sumAB = 0, n = a.length;
  for (let i = 0; i < n; i++) { sumA += a[i]*a[i]; sumB += b[i]*b[i]; sumAB += a[i]*b[i]; }
  const den = Math.sqrt(sumA * sumB);
  return den > 1e-12 ? sumAB / den : 0;
}

function isMonoActive() { return monoEnabled || bassMonoEnabled; }

function engineLoop(timestamp) {
  if (!isPlaying) { animId = null; return; }
  const cur = ctx.currentTime - startTime + pausedAt;
  const ratio = Math.min(1, cur / Math.max(duration, 0.001));
  const updateDom = (timestamp - lastDom) > 80;

  if (anaL && anaR) {
    const tdL = new Float32Array(anaL.fftSize);
    const tdR = new Float32Array(anaR.fftSize);
    anaL.getFloatTimeDomainData(tdL);
    anaR.getFloatTimeDomainData(tdR);

    let sumL = 0, sumR = 0, sumLR = 0, hasSig = false, peak = 0;
    const rCtx = UI.radar.getContext('2d');
    const rw = UI.radar.width, rh = UI.radar.height;
    rCtx.clearRect(0, 0, rw, rh);
    rCtx.strokeStyle = 'rgba(255,255,255,0.05)'; rCtx.lineWidth = 1;
    rCtx.beginPath(); rCtx.moveTo(rw/2,0); rCtx.lineTo(rw/2,rh); rCtx.moveTo(0,rh/2); rCtx.lineTo(rw,rh/2); rCtx.stroke();
    rCtx.strokeStyle = isMonoActive() ? '#ff003c' : getAcc(); rCtx.lineWidth = 1.5; rCtx.beginPath();

    for (let i = 0; i < tdL.length; i++) {
      const l = tdL[i], r = tdR[i];
      sumL += l*l; sumR += r*r; sumLR += l*r;
      const a = Math.max(Math.abs(l), Math.abs(r));
      if (a > peak) peak = a;
      if (a > 0.99) clipCounter++;
      if (i % 4 === 0) {
        if (Math.abs(l) > 0.02 || Math.abs(r) > 0.02) hasSig = true;
        const x = rw/2 + ((r - l) * 0.707) * (rw/2);
        const y = rh/2 - ((l + r) * 0.707) * (rh/2);
        if (i === 0) rCtx.moveTo(x,y); else rCtx.lineTo(x,y);
      }
    }
    if (hasSig) rCtx.stroke();
    if (peak > maxPeakSession) maxPeakSession = peak;
    rmsAcc += (sumL + sumR) / (2 * tdL.length); rmsCount++;

    const rL = Math.sqrt(sumL / tdL.length), rR = Math.sqrt(sumR / tdR.length);
    const corr = (rL * rR > 1e-9) ? (sumLR / tdL.length) / (rL * rR) : 0;
    corrSmooth += (corr - corrSmooth) * 0.2;
    pkHoldL = Math.max(pkHoldL * 0.96, rL); pkHoldR = Math.max(pkHoldR * 0.96, rR);
    drawMeter(UI.chL, rL, pkHoldL); drawMeter(UI.chR, rR, pkHoldR);

    if (updateDom) {
      document.getElementById('corrVal').textContent = corrSmooth.toFixed(2);
      const corrMap = ((corrSmooth + 1) / 2) * 100;
      const cb = document.getElementById('corrBar');
      cb.style.width = Math.abs(corrMap - 50) + '%';
      cb.style.left = (corrMap > 50 ? 50 : corrMap) + '%';
      const widthPerc = Math.max(0, Math.min(100, (1 - corrSmooth) * 50));
      document.getElementById('widthVal').textContent = widthPerc.toFixed(0) + '%';
      document.getElementById('widthBar').style.width = widthPerc + '%';
      document.getElementById('chLVal').textContent = dBFS(rL);
      document.getElementById('chRVal').textContent = dBFS(rR);
      document.getElementById('clipCount').textContent = clipCounter;
    }
  }

  if (anaLowL && anaLowR) {
    const lL = new Float32Array(anaLowL.fftSize), lR = new Float32Array(anaLowR.fftSize);
    anaLowL.getFloatTimeDomainData(lL); anaLowR.getFloatTimeDomainData(lR);
    if (updateDom) document.getElementById('corrLowVal').textContent = pearson(lL, lR).toFixed(2);
    const pCtx = UI.phaseLow.getContext('2d');
    const pw = UI.phaseLow.width, ph = UI.phaseLow.height;
    pCtx.clearRect(0, 0, pw, ph);
    pCtx.strokeStyle = getAcc(); pCtx.lineWidth = 1.2; pCtx.beginPath();
    for (let i = 0; i < lL.length; i += 2) {
      const x = (i / lL.length) * pw;
      const y = ph/2 - lL[i] * (ph/2) * 0.9;
      if (i === 0) pCtx.moveTo(x, y); else pCtx.lineTo(x, y);
    }
    pCtx.stroke();
  }
  if (anaMidL && anaMidR && updateDom) {
    const mL = new Float32Array(anaMidL.fftSize), mR = new Float32Array(anaMidR.fftSize);
    anaMidL.getFloatTimeDomainData(mL); anaMidR.getFloatTimeDomainData(mR);
    document.getElementById('corrMidVal').textContent = pearson(mL, mR).toFixed(2);
  }
  if (anaHighL && anaHighR && updateDom) {
    const hL = new Float32Array(anaHighL.fftSize), hR = new Float32Array(anaHighR.fftSize);
    anaHighL.getFloatTimeDomainData(hL); anaHighR.getFloatTimeDomainData(hR);
    document.getElementById('corrHighVal').textContent = pearson(hL, hR).toFixed(2);
  }

  if (updateDom) {
    UI.slider.value = ratio * 1000;
    UI.time.textContent = format(cur) + ' / ' + format(duration);
    lastDom = timestamp;
  }

  if (anaMain && currentView !== 'waveform') {
    const fd = new Uint8Array(anaMain.frequencyBinCount);
    anaMain.getByteFrequencyData(fd);
    const c = UI.canvas.getContext('2d');
    const w = UI.canvas.width, h = UI.canvas.height;
    c.clearRect(0, 0, w, h);
    let sum = 0, wsum = 0;

    if (currentView === 'spectrum') {
      c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
      c.fillStyle = 'var(--txt-dim)'; c.font = '10px var(--font)';
      [100,500,1000,5000,10000].forEach(f => {
        const x = w * (Math.log10(f/20) / Math.log10((sr/2)/20));
        c.beginPath(); c.moveTo(x,0); c.lineTo(x,h); c.stroke();
        c.fillText(f >= 1000 ? (f/1000)+'K' : f, x+4, 12);
      });
      c.beginPath();
      for (let i = 0; i < fd.length; i++) {
        const f = Math.max(20, (i/fd.length)*(sr/2));
        const x = w * (Math.log10(f/20) / Math.log10((sr/2)/20));
        const y = h * (1 - fd[i]/255);
        sum += fd[i]; wsum += fd[i]*i;
        if (i === 0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.lineTo(w,h); c.lineTo(0,h); c.closePath();
      c.fillStyle = getAcc() + '33'; c.fill(); c.strokeStyle = getAcc(); c.stroke();
    } else if (currentView === 'bars') {
      const barCount = 64, step = Math.floor(fd.length/barCount), gap = 2, barW = (w/barCount)-gap;
      for (let i = 0; i < barCount; i++) {
        let v = 0; for (let j = 0; j < step; j++) v += fd[i*step+j]||0; v /= step;
        sum += v; wsum += v*i*step;
        c.fillStyle = getAcc(); c.globalAlpha = 0.3 + (v/255)*0.7;
        c.fillRect(i*(barW+gap), h - (v/255)*h, barW, (v/255)*h);
      }
      c.globalAlpha = 1;
    } else if (currentView === 'radial') {
      const cx = w/2, cy = h/2, baseR = Math.min(w,h)*0.18, maxR = Math.min(w,h)*0.42;
      const bars = 96, step = Math.floor(fd.length/bars);
      c.strokeStyle = 'rgba(255,255,255,0.06)'; c.beginPath(); c.arc(cx,cy,baseR,0,Math.PI*2); c.stroke();
      c.strokeStyle = getAcc(); c.lineWidth = 2;
      for (let i = 0; i < bars; i++) {
        let v = 0; for (let j = 0; j < step; j++) v += fd[i*step+j]||0; v /= step;
        sum += v; wsum += v*i*step;
        const ang = (i/bars)*Math.PI*2, len = baseR + (v/255)*(maxR-baseR);
        c.globalAlpha = 0.35 + (v/255)*0.65;
        c.beginPath(); c.moveTo(cx+Math.cos(ang)*baseR, cy+Math.sin(ang)*baseR);
        c.lineTo(cx+Math.cos(ang)*len, cy+Math.sin(ang)*len); c.stroke();
      }
      c.globalAlpha = 1;
    } else if (currentView === 'waterfall') {
      if (!waterfallBuf || waterfallBuf.width !== w || waterfallBuf.height !== h) {
        waterfallBuf = document.createElement('canvas'); waterfallBuf.width = w; waterfallBuf.height = h;
        waterfallCtx = waterfallBuf.getContext('2d'); waterfallCtx.fillStyle = '#000'; waterfallCtx.fillRect(0,0,w,h);
      }
      waterfallCtx.drawImage(waterfallBuf, -1, 0);
      const accRgb = getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim();
      for (let y = 0; y < h; y++) {
        const idx = Math.floor((1 - y/h) * fd.length);
        const v = fd[idx] || 0; sum += v; wsum += v * idx;
        waterfallCtx.fillStyle = 'rgba('+accRgb+','+(v/255).toFixed(3)+')';
        waterfallCtx.fillRect(w-1, y, 1, 1);
      }
      c.drawImage(waterfallBuf, 0, 0);
    }
    if (updateDom && sum > 0) {
      document.getElementById('centroidVal').textContent = ((wsum/sum)*(sr/2/fd.length)).toFixed(0) + ' HZ';
    }
  } else {
    drawStatic(ratio);
  }

  if (cur >= duration && isPlaying) {
    if (!source) {
      isPlaying = false;
      animId = null;
      return;
    }
  }

  animId = requestAnimationFrame(engineLoop);
}

function drawStatic(ratio) {
  if (currentView !== 'waveform') return;
  const c = UI.canvas.getContext('2d');
  const w = UI.canvas.width, h = UI.canvas.height;
  c.clearRect(0, 0, w, h);
  if (!wavePeaks) return;
  const mid = h / 2;
  c.beginPath(); c.moveTo(0, mid);
  for (let i = 0; i < wavePeaks.length; i++) c.lineTo((i/wavePeaks.length)*w, mid - wavePeaks[i]*(h/2.1));
  for (let i = wavePeaks.length-1; i >= 0; i--) c.lineTo((i/wavePeaks.length)*w, mid + wavePeaks[i]*(h/2.1));
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(); c.strokeStyle = getAcc(); c.stroke();
  c.beginPath(); c.moveTo(ratio*w, 0); c.lineTo(ratio*w, h); c.strokeStyle = '#fff'; c.lineWidth = 1; c.stroke();
}

window.onload = resize;
})();
