/**
 * UI controller – DOM updates, keyboard, export, playlist
 */

import { dBFS, fmtLUFS } from './meters.js';

export class UI {
  constructor() {
    this.els = {
      fileName: document.getElementById('fileName'),
      playBtn: document.getElementById('playBtn'),
      timeDisplay: document.getElementById('timeDisplay'),
      progress: document.getElementById('progressSlider'),
      playlist: document.getElementById('playlistEl'),
      lufsMom: document.getElementById('lufsMom'),
      lufsShort: document.getElementById('lufsShort'),
      lufsInt: document.getElementById('lufsInt'),
      truePeak: document.getElementById('truePeak'),
      peakLR: document.getElementById('peakLR'),
      rmsLR: document.getElementById('rmsLR'),
      clipCount: document.getElementById('clipCount'),
      corrVal: document.getElementById('corrVal'),
      corrBar: document.getElementById('corrBar'),
      widthVal: document.getElementById('widthVal'),
      widthBar: document.getElementById('widthBar'),
      msRatio: document.getElementById('msRatio'),
      centroidVal: document.getElementById('centroidVal'),
      crestVal: document.getElementById('drVal'),
      abLabel: document.getElementById('abLabel')
    };
  }

  updateMeters(m) {
    if (this.els.lufsMom) this.els.lufsMom.textContent = fmtLUFS(m.momentary);
    if (this.els.lufsShort) this.els.lufsShort.textContent = fmtLUFS(m.shortTerm);
    if (this.els.lufsInt) this.els.lufsInt.textContent = fmtLUFS(m.integrated);
    if (this.els.truePeak) this.els.truePeak.textContent = isFinite(m.truePeak) ? m.truePeak.toFixed(1) : '--';
    if (this.els.peakLR) this.els.peakLR.textContent = `${dBFS(m.peakL)} / ${dBFS(m.peakR)}`;
    if (this.els.rmsLR) this.els.rmsLR.textContent = `${dBFS(m.rmsL)} / ${dBFS(m.rmsR)}`;
    if (this.els.clipCount) {
      this.els.clipCount.textContent = m.clipCount;
      this.els.clipCount.classList.toggle('alert', m.clipCount > 0);
    }
    if (this.els.corrVal) this.els.corrVal.textContent = m.corrSmoothed.toFixed(2);
    if (this.els.corrBar) {
      const corrMap = ((m.corrSmoothed + 1) / 2) * 100;
      this.els.corrBar.style.width = Math.abs(corrMap - 50) + '%';
      this.els.corrBar.style.left = (corrMap > 50 ? 50 : corrMap) + '%';
    }
    if (this.els.widthVal) {
      const widthPerc = Math.max(0, Math.min(100, (1 - m.corrSmoothed) * 50));
      this.els.widthVal.textContent = widthPerc.toFixed(0) + '%';
      if (this.els.widthBar) this.els.widthBar.style.width = widthPerc + '%';
    }
    if (this.els.msRatio) this.els.msRatio.textContent = (m.midSideRatio * 100).toFixed(0) + '%';
    if (this.els.crestVal) this.els.crestVal.textContent = m.crest.toFixed(1) + ' DB';
  }

  updateCentroid(hz) {
    if (this.els.centroidVal) this.els.centroidVal.textContent = hz > 0 ? hz.toFixed(0) + ' HZ' : '-- HZ';
  }

  updateTime(cur, dur) {
    const fmt = (s) => {
      if (!s || !isFinite(s)) return '00:00';
      const m = Math.floor(s / 60), sec = Math.floor(s % 60);
      return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    };
    if (this.els.timeDisplay) this.els.timeDisplay.textContent = `${fmt(cur)} / ${fmt(dur)}`;
    if (this.els.progress) this.els.progress.value = (cur / Math.max(dur, 0.001)) * 1000;
  }

  setPlaying(playing) {
    if (this.els.playBtn) {
      this.els.playBtn.textContent = playing ? 'HALT_PLAY' : 'INIT_PLAY';
      this.els.playBtn.setAttribute('data-text', playing ? 'HALT_PLAY' : 'INIT_PLAY');
    }
  }

  setFileName(name) {
    if (this.els.fileName) this.els.fileName.textContent = name || '[ NULL_INPUT ]';
  }

  setAB(label) {
    if (this.els.abLabel) this.els.abLabel.textContent = `SLOT_${label}`;
  }

  renderPlaylist(playlist, current) {
    const el = this.els.playlist;
    if (!el) return;
    el.innerHTML = '';
    if (!playlist.length) {
      el.innerHTML = '<div class="empty-hint">[ NO_TRACKS_LOADED ]</div>';
      return;
    }
    playlist.forEach((t, i) => {
      const div = document.createElement('div');
      div.className = 'track-item' + (i === current ? ' active' : '');
      div.innerHTML = `<span><span class="track-idx">${(i + 1).toString().padStart(2, '0')}</span>${t.name}</span>`;
      div.dataset.idx = i;
      el.appendChild(div);
    });
  }

  exportPNG(canvas) {
    const a = document.createElement('a');
    a.download = `ps-visu-${Date.now()}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }
}
