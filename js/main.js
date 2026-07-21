/**
 * PS-VISU v2 – bootstrap (fixed seek, restored goniometer, mono controls)
 */

import { AudioEngine } from './audio-engine.js';
import { MeterState } from './meters.js';
import { Visualizers } from './visualizers.js';
import { UI } from './ui.js';

const meters = new MeterState();
const ui = new UI();

const engine = new AudioEngine({
  onMetrics: (data) => meters.updateFromWorklet(data),
  onEnded: () => {
    ui.setPlaying(false);
  }
});

const vis = new Visualizers({
  main: document.getElementById('mainCanvas'),
  chL: document.getElementById('chLCanvas'),
  chR: document.getElementById('chRCanvas'),
  radar: document.getElementById('stereoRadar')
});

let playlist = [];
let currentTrack = -1;
let animId = null;
let lastDom = 0;

function computePeaks(chData, pixels) {
  const peaks = new Float32Array(pixels);
  const block = Math.max(1, Math.floor(chData.length / pixels));
  for (let i = 0; i < pixels; i++) {
    let max = 0;
    const start = i * block;
    const end = Math.min(start + block, chData.length);
    for (let j = start; j < end; j++) {
      const v = Math.abs(chData[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

function forceRedraw() {
  const cur = engine.getCurrentTime();
  const ratio = Math.min(1, cur / Math.max(engine.duration, 0.001));
  const { anaL, anaR } = engine.getTimeDomainAnalysers();
  vis.setForceRed(engine.isMonoActive());
  const centroid = vis.render(engine.getAnalyser(), anaL, anaR, meters, ratio);
  ui.updateMeters(meters);
  ui.updateCentroid(centroid);
  ui.updateTime(cur, engine.duration);
}

async function loadTrack(idx, autoplay = false) {
  if (idx < 0 || idx >= playlist.length) return;
  currentTrack = idx;
  const t = playlist[idx];
  ui.setFileName(t.name);
  ui.renderPlaylist(playlist, currentTrack);

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      await engine.init();
      await engine.resume();
      const buf = await engine.loadBuffer(ev.target.result, 'A');
      vis.setSampleRate(engine.getSampleRate());
      const peaks = computePeaks(buf.getChannelData(0), Math.max(1000, vis.main.width || 1200));
      vis.setWaveformPeaks(peaks);
      engine.resetMeters();
      meters.reset();
      forceRedraw();
      if (autoplay) {
        engine.play();
        ui.setPlaying(true);
        startLoop();
      }
    } catch (err) {
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(t.file);
}

function startLoop() {
  if (animId) return;
  const loop = (ts) => {
    const cur = engine.getCurrentTime();
    const ratio = Math.min(1, cur / Math.max(engine.duration, 0.001));
    const doDom = (ts - lastDom) > 80;

    const { anaL, anaR } = engine.getTimeDomainAnalysers();
    vis.setForceRed(engine.isMonoActive());
    const centroid = vis.render(engine.getAnalyser(), anaL, anaR, meters, ratio);

    if (doDom) {
      ui.updateMeters(meters);
      ui.updateCentroid(centroid);
      ui.updateTime(cur, engine.duration);
      lastDom = ts;
    }

    if (engine.isPlaying) {
      animId = requestAnimationFrame(loop);
    } else {
      animId = null;
    }
  };
  animId = requestAnimationFrame(loop);
}

document.getElementById('fileInput').addEventListener('change', (e) => {
  const files = Array.from(e.target.files);
  if (!files.length) return;
  files.forEach(f => playlist.push({ name: f.name, file: f }));
  ui.renderPlaylist(playlist, currentTrack);
  if (currentTrack === -1) loadTrack(0);
});

document.getElementById('playBtn').addEventListener('click', async () => {
  await engine.resume();
  if (engine.isPlaying) {
    engine.pause();
    ui.setPlaying(false);
    forceRedraw();
  } else {
    engine.play();
    ui.setPlaying(true);
    startLoop();
  }
});

document.getElementById('prevBtn').addEventListener('click', () => {
  if (!playlist.length) return;
  loadTrack((currentTrack - 1 + playlist.length) % playlist.length, true);
});
document.getElementById('nextBtn').addEventListener('click', () => {
  if (!playlist.length) return;
  loadTrack((currentTrack + 1) % playlist.length, true);
});

document.getElementById('progressSlider').addEventListener('input', (e) => {
  engine.seek(e.target.value / 1000);
  forceRedraw();
});

document.getElementById('volSlider').addEventListener('input', (e) => {
  engine.setVolume(parseFloat(e.target.value));
});

document.getElementById('fftSize').addEventListener('change', (e) => {
  engine.setFFTSize(parseInt(e.target.value));
});

document.getElementById('resetBtn').addEventListener('click', () => {
  engine.resetMeters();
  meters.reset();
  ui.updateMeters(meters);
});

document.getElementById('accentPicker').addEventListener('input', (e) => {
  const hex = e.target.value;
  document.documentElement.style.setProperty('--accent', hex);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
});

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', (e) => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    e.target.classList.add('active');
    vis.setView(e.target.dataset.view);
    forceRedraw();
  });
});

document.getElementById('playlistEl').addEventListener('click', (e) => {
  const item = e.target.closest('.track-item');
  if (item) loadTrack(parseInt(item.dataset.idx), true);
});

const monoBtn = document.getElementById('monoBtn');
const bassMonoBtn = document.getElementById('bassMonoBtn');
const bassFreqSlider = document.getElementById('bassFreq');
const bassFreqLabel = document.getElementById('bassFreqLabel');

if (monoBtn) {
  monoBtn.addEventListener('click', () => {
    const next = !engine.monoEnabled;
    engine.setMono(next);
    monoBtn.classList.toggle('active', next);
    monoBtn.style.background = next ? 'var(--alert)' : '';
    monoBtn.style.color = next ? '#000' : '';
    forceRedraw();
  });
}

if (bassMonoBtn) {
  bassMonoBtn.addEventListener('click', () => {
    const next = !engine.bassMonoEnabled;
    engine.setBassMono(next);
    bassMonoBtn.classList.toggle('active', next);
    bassMonoBtn.style.background = next ? 'var(--alert)' : '';
    bassMonoBtn.style.color = next ? '#000' : '';
    forceRedraw();
  });
}

if (bassFreqSlider) {
  bassFreqSlider.addEventListener('input', (e) => {
    const hz = parseInt(e.target.value);
    engine.setBassMonoFreq(hz);
    if (bassFreqLabel) bassFreqLabel.textContent = hz + ' HZ';
    forceRedraw();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      document.getElementById('playBtn').click();
      break;
    case 'ArrowLeft':
      document.getElementById('prevBtn').click();
      break;
    case 'ArrowRight':
      document.getElementById('nextBtn').click();
      break;
    case 'KeyF':
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
      break;
    case 'KeyM':
      const vol = document.getElementById('volSlider');
      if (parseFloat(vol.value) > 0) {
        vol.dataset.prev = vol.value;
        vol.value = 0;
        engine.setVolume(0);
      } else {
        vol.value = vol.dataset.prev || 0.8;
        engine.setVolume(parseFloat(vol.value));
      }
      break;
    case 'Digit1': vis.setView('spectrum'); forceRedraw(); break;
    case 'Digit2': vis.setView('bars'); forceRedraw(); break;
    case 'Digit3': vis.setView('radial'); forceRedraw(); break;
    case 'Digit4': vis.setView('waterfall'); forceRedraw(); break;
    case 'Digit5': vis.setView('waveform'); forceRedraw(); break;
    case 'KeyE':
      ui.exportPNG(document.getElementById('mainCanvas'));
      break;
    case 'KeyA':
      const slot = engine.switchAB();
      ui.setAB(slot);
      break;
  }
});

document.getElementById('micBtn')?.addEventListener('click', async () => {
  try {
    await engine.startMic();
    ui.setFileName('[ LIVE_MIC ]');
    ui.setPlaying(true);
    startLoop();
  } catch (err) {
    console.error('Mic error', err);
  }
});

window.addEventListener('resize', () => {
  vis.resize();
  forceRedraw();
});
window.addEventListener('load', () => {
  vis.resize();
  ui.renderPlaylist([], -1);
});

console.log('PS-VISU v2 ready – goniometer restored, seek fixed, mono controls');
