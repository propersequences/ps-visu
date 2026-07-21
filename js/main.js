/**
 * PS-VISU v2 – bootstrap
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
      const ch = buf.getChannelData(0);
      vis.setWaveformPeaks(computePeaks(ch, 1000));
      engine.resetMeters();
      meters.reset();
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

    const centroid = vis.render(engine.getAnalyser(), meters, ratio, engine.isPlaying);

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

// Events
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
  });
});

document.getElementById('playlistEl').addEventListener('click', (e) => {
  const item = e.target.closest('.track-item');
  if (item) loadTrack(parseInt(item.dataset.idx), true);
});

// Keyboard
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
    case 'Digit1': vis.setView('spectrum'); break;
    case 'Digit2': vis.setView('bars'); break;
    case 'Digit3': vis.setView('radial'); break;
    case 'Digit4': vis.setView('waterfall'); break;
    case 'Digit5': vis.setView('waveform'); break;
    case 'KeyE':
      ui.exportPNG(document.getElementById('mainCanvas'));
      break;
    case 'KeyA':
      const slot = engine.switchAB();
      ui.setAB(slot);
      break;
  }
});

// Mic
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

window.addEventListener('resize', () => vis.resize());
window.addEventListener('load', () => {
  vis.resize();
  ui.renderPlaylist([], -1);
});

console.log('PS-VISU v2 ready');
