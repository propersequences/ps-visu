(function(){
'use strict';

const UI = {
  canvas: document.getElementById('mainCanvas'), chL: document.getElementById('chLCanvas'),
  chR: document.getElementById('chRCanvas'), radar: document.getElementById('stereoRadar'),
  time: document.getElementById('timeDisplay'), playBtn: document.getElementById('playBtn'),
  slider: document.getElementById('progressSlider'), playlist: document.getElementById('playlistContainer')
};

function resize() {
  [UI.canvas, UI.chL, UI.chR, UI.radar].forEach(c => {
    const r = c.parentElement.getBoundingClientRect();
    c.width = r.width; c.height = r.height;
  });
}
window.addEventListener('resize', resize);

let ctx = null, buffer = null, source = null, gain = null, splitter = null;
let anaL = null, anaR = null, anaMain = null;
let isPlaying = false, startTime = 0, pausedAt = 0, duration = 0, sr = 44100;
let animId = null, currentView = 'spectrum';
let pkHoldL = 0, pkHoldR = 0, wavePeaks = null, corrSmooth = 0, lastDom = 0;

let trackQueue = [], activeIdx = -1;

function getAcc() { return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); }
function dBFS(v) { return v <= 0.00001 ? '-INF' : (20 * Math.log10(v)).toFixed(1); }
function format(s) { if(!s||!isFinite(s)) return '00:00'; const m=Math.floor(s/60), sc=Math.floor(s%60); return `${m.toString().padStart(2,'0')}:${sc.toString().padStart(2,'0')}`; }

document.getElementById('accentPicker').addEventListener('input', e => {
  const hex = e.target.value;
  document.documentElement.style.setProperty('--accent', hex);
  let r = parseInt(hex.substring(1,3), 16), g = parseInt(hex.substring(3,5), 16), b = parseInt(hex.substring(5,7), 16);
  document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
});

document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', e => {
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  e.target.classList.add('active'); currentView = e.target.dataset.view;
}));

document.getElementById('volSlider').addEventListener('input', e => { if(gain) gain.gain.value = parseFloat(e.target.value); });

function initAudio() {
  if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if(ctx.state === 'suspended') ctx.resume();
}

document.getElementById('fileInput').addEventListener('change', e => {
  const files = Array.from(e.target.files); if(!files.length) return;
  trackQueue = trackQueue.concat(files);
  document.getElementById('queueCount').textContent = `${trackQueue.length}_FILES`;
  renderQueue();
  if(activeIdx === -1) loadTrack(0, false);
});

function renderQueue() {
  UI.playlist.innerHTML = '';
  trackQueue.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'q-item' + (i === activeIdx ? ' active' : '');
    el.textContent = `[${i.toString().padStart(2,'0')}] ${f.name.toUpperCase()}`;
    el.onclick = () => loadTrack(i, true);
    UI.playlist.appendChild(el);
  });
}

function loadTrack(idx, autoPlay) {
  if(idx < 0 || idx >= trackQueue.length) return;
  activeIdx = idx; renderQueue();
  const file = trackQueue[idx];
  document.getElementById('fileName').textContent = file.name.toUpperCase();
  
  const reader = new FileReader();
  reader.onload = async ev => {
    initAudio();
    if(source) { source.stop(); source.disconnect(); source = null; }
    isPlaying = false;
    try {
      buffer = await ctx.decodeAudioData(ev.target.result);
      pausedAt = 0; pkHoldL = 0; pkHoldR = 0;
      processData(buffer); resize();
      if(autoPlay) playExec();
    } catch(err) { console.error(err); }
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById('nextBtn').addEventListener('click', () => { if(trackQueue.length) loadTrack((activeIdx + 1) % trackQueue.length, true); });
document.getElementById('prevBtn').addEventListener('click', () => { if(trackQueue.length) loadTrack((activeIdx - 1 + trackQueue.length) % trackQueue.length, true); });

function processData(buf) {
  sr = buf.sampleRate; duration = buf.duration;
  const chL = buf.getChannelData(0), chR = buf.numberOfChannels > 1 ? buf.getChannelData(1) : chL;
  
  const pixels = UI.canvas.width || 1000;
  wavePeaks = new Float32Array(pixels);
  const block = Math.max(1, Math.floor(chL.length / pixels));
  for(let i=0; i<pixels; i++) {
    let max = 0; for(let j=i*block; j<(i+1)*block && j<chL.length; j++) if(Math.abs(chL[j])>max) max=Math.abs(chL[j]);
    wavePeaks[i] = max;
  }
  
  let sqL=0, pkL=0, sqR=0, pkR=0;
  for(let i=0; i<chL.length; i++) { 
    if(Math.abs(chL[i])>pkL) pkL=Math.abs(chL[i]); if(Math.abs(chR[i])>pkR) pkR=Math.abs(chR[i]);
    sqL += chL[i]*chL[i]; sqR += chR[i]*chR[i];
  }
  
  document.getElementById('peakLR').textContent = `${dBFS(pkL)} / ${dBFS(pkR)}`;
  const rL = Math.sqrt(sqL/chL.length), rR = Math.sqrt(sqR/chR.length);
  document.getElementById('rmsLR').textContent = `${dBFS(rL)} / ${dBFS(rR)}`;
  
  const meanSq = (sqL + sqR) / (chL.length * 2);
  document.getElementById('lufsInt').textContent = meanSq > 1e-12 ? (-0.691 + 10 * Math.log10(meanSq)).toFixed(1) : '--';
  drawStatic(0);
}

function playExec() {
  if(!buffer) return;
  initAudio();
  if(isPlaying) {
    pausedAt = Math.min(ctx.currentTime - startTime + pausedAt, duration);
    if(source) { source.stop(); source.disconnect(); source = null; }
    isPlaying = false; UI.playBtn.textContent = 'EXECUTE'; UI.playBtn.classList.remove('active');
  } else {
    if(source) source.disconnect();
    source = ctx.createBufferSource(); source.buffer = buffer;
    if(!gain) gain = ctx.createGain(); gain.gain.value = parseFloat(document.getElementById('volSlider').value);
    
    splitter = ctx.createChannelSplitter(2);
    anaL = ctx.createAnalyser(); anaR = ctx.createAnalyser(); anaMain = ctx.createAnalyser();
    anaL.fftSize = 2048; anaR.fftSize = 2048; anaMain.fftSize = 4096;
    anaL.smoothingTimeConstant = 0.4; anaR.smoothingTimeConstant = 0.4; anaMain.smoothingTimeConstant = 0.8;
    
    source.connect(gain); gain.connect(splitter);
    splitter.connect(anaL, 0); splitter.connect(anaR, 1);
    gain.connect(anaMain); gain.connect(ctx.destination);
    
    if(pausedAt >= duration) pausedAt = 0;
    source.start(0, pausedAt);
    startTime = ctx.currentTime; isPlaying = true;
    UI.playBtn.textContent = 'HALT'; UI.playBtn.classList.add('active');
    if(!animId) requestAnimationFrame(engineLoop);
  }
}
UI.playBtn.addEventListener('click', playExec);

UI.slider.addEventListener('input', e => {
  if(!buffer) return;
  pausedAt = (e.target.value / 1000) * duration;
  if(isPlaying) { playExec(); playExec(); } 
  else { drawStatic(e.target.value / 1000); UI.time.textContent = format(pausedAt) + ' / ' + format(duration); }
});

function drawMeter(c, val, hold) {
  const ctx = c.getContext('2d'), w = c.width, h = c.height;
  ctx.clearRect(0,0,w,h);
  const db = 20 * Math.log10(Math.max(val, 0.0001)), fillH = Math.max(0, Math.min(1, (db + 60) / 60)) * h;
  ctx.fillStyle = db > -1 ? 'var(--alert)' : getAcc();
  ctx.fillRect(0, h - fillH, w, fillH);
  const holdH = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(hold, 0.0001)) + 60) / 60)) * h;
  if(holdH > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(0, h - holdH - 2, w, 2); }
}

function engineLoop(timestamp) {
  if(!isPlaying) { animId = null; return; }
  const cur = ctx.currentTime - startTime + pausedAt, ratio = Math.min(1, cur/duration);
  const updateDom = (timestamp - lastDom) > 100;

  if(anaL && anaR) {
    const tdL = new Uint8Array(anaL.fftSize), tdR = new Uint8Array(anaR.fftSize);
    anaL.getByteTimeDomainData(tdL); anaR.getByteTimeDomainData(tdR);
    let sumL=0, sumR=0, sumLR=0, hasSig = false;
    
    const radarCtx = UI.radar.getContext('2d'), rw = UI.radar.width, rh = UI.radar.height;
    radarCtx.clearRect(0,0,rw,rh);
    radarCtx.strokeStyle = 'rgba(255,255,255,0.05)'; radarCtx.beginPath(); radarCtx.moveTo(rw/2,0); radarCtx.lineTo(rw/2,rh); radarCtx.moveTo(0,rh/2); radarCtx.lineTo(rw,rh/2); radarCtx.stroke();
    radarCtx.strokeStyle = getAcc(); radarCtx.beginPath();

    for(let i=0; i<tdL.length; i++) {
      const l = (tdL[i]-128)/128, r = (tdR[i]-128)/128;
      sumL += l*l; sumR += r*r; sumLR += l*r;
      if(i%4===0) {
        if(Math.abs(l)>0.02 || Math.abs(r)>0.02) hasSig = true;
        const x = rw/2 + ((r-l)*0.707)*(rw/2), y = rh/2 - ((l+r)*0.707)*(rh/2);
        if(i===0) radarCtx.moveTo(x,y); else radarCtx.lineTo(x,y);
      }
    }
    if(hasSig) radarCtx.stroke();

    const rL = Math.sqrt(sumL/tdL.length), rR = Math.sqrt(sumR/tdR.length);
    const corr = (rL*rR > 1e-9) ? (sumLR/tdL.length)/(rL*rR) : 0;
    corrSmooth += (corr - corrSmooth) * 0.2;
    pkHoldL = Math.max(pkHoldL * 0.96, rL); pkHoldR = Math.max(pkHoldR * 0.96, rR);
    
    drawMeter(UI.chL, rL, pkHoldL); drawMeter(UI.chR, rR, pkHoldR);

    if(updateDom) {
      document.getElementById('corrVal').textContent = corrSmooth.toFixed(2);
      document.getElementById('widthVal').textContent = Math.max(0, Math.min(100, (1 - corrSmooth) * 50)).toFixed(0) + '%';
      document.getElementById('chLVal').textContent = dBFS(rL); document.getElementById('chRVal').textContent = dBFS(rR);
    }
  }

  if(updateDom) { UI.slider.value = ratio * 1000; UI.time.textContent = format(cur) + ' / ' + format(duration); lastDom = timestamp; }

  if(anaMain && currentView !== 'waveform') {
    const fd = new Uint8Array(anaMain.frequencyBinCount);
    anaMain.getByteFrequencyData(fd);
    const c = UI.canvas.getContext('2d'), w = UI.canvas.width, h = UI.canvas.height;
    c.clearRect(0,0,w,h);
    
    if(currentView === 'spectrum') {
      c.beginPath();
      for(let i=0; i<fd.length; i++) {
        const x = w * (Math.log10(Math.max(20, (i/fd.length)*(sr/2))/20) / Math.log10((sr/2)/20));
        const y = h * (1 - fd[i]/255);
        if(i===0) c.moveTo(x,y); else c.lineTo(x,y);
      }
      c.lineTo(w, h); c.lineTo(0, h); c.fillStyle = getAcc()+'33'; c.fill(); c.strokeStyle = getAcc(); c.stroke();
    } else if(currentView === 'radial') {
      const cx = w/2, cy = h/2, baseR = Math.min(w,h)*0.2, maxR = Math.min(w,h)*0.45, bars=96, step = Math.floor(fd.length/bars);
      c.strokeStyle = getAcc(); c.lineWidth = 2;
      for(let i=0; i<bars; i++) {
        let v=0; for(let j=0; j<step; j++) v+=fd[i*step+j]; v/=step;
        const ang = (i/bars)*6.283, len = baseR + (v/255)*(maxR-baseR);
        c.globalAlpha = 0.3 + (v/255)*0.7;
        c.beginPath(); c.moveTo(cx+Math.cos(ang)*baseR, cy+Math.sin(ang)*baseR); c.lineTo(cx+Math.cos(ang)*len, cy+Math.sin(ang)*len); c.stroke();
      }
      c.globalAlpha = 1;
    }
  } else drawStatic(ratio);

  if(cur >= duration) {
    if(activeIdx < trackQueue.length - 1) loadTrack(activeIdx + 1, true);
    else { playExec(); UI.slider.value = 1000; drawStatic(1); UI.time.textContent = format(duration) + ' / ' + format(duration); }
    return;
  }
  animId = requestAnimationFrame(engineLoop);
}

function drawStatic(ratio) {
  if(currentView !== 'waveform') return;
  const c = UI.canvas.getContext('2d'), w = UI.canvas.width, h = UI.canvas.height;
  c.clearRect(0,0,w,h);
  if(!wavePeaks) return;
  c.beginPath(); c.moveTo(0, h/2);
  for(let i=0; i<wavePeaks.length; i++) c.lineTo((i/wavePeaks.length)*w, h/2 - wavePeaks[i]*(h/2.2));
  for(let i=wavePeaks.length-1; i>=0; i--) c.lineTo((i/wavePeaks.length)*w, h/2 + wavePeaks[i]*(h/2.2));
  c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(); c.strokeStyle = getAcc(); c.stroke();
  c.beginPath(); c.moveTo(ratio*w, 0); c.lineTo(ratio*w, h); c.strokeStyle = '#fff'; c.stroke();
}

window.onload = resize;
})();
