// Web Audio API Synthesizer for AFTERGROUND
// Generates atmospheric subterranean music and crisp UI/gameplay sound effects with zero external asset downloads.

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.masterVolume = 0.8;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.8;
    this.muted = false;
    this.musicTimer = null;
    this.musicPlaying = false;
    this.chordIndex = 0;
  }

  init() {
    if (this.ctx || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
    } catch {
      this.ctx = null;
    }
  }

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setVolumes({ master, music, sfx, muted }) {
    if (typeof master === 'number') this.masterVolume = Math.max(0, Math.min(1, master));
    if (typeof music === 'number') this.musicVolume = Math.max(0, Math.min(1, music));
    if (typeof sfx === 'number') this.sfxVolume = Math.max(0, Math.min(1, sfx));
    if (typeof muted === 'boolean') this.muted = muted;
  }

  getEffectiveSfxGain() {
    if (this.muted) return 0;
    return this.masterVolume * this.sfxVolume;
  }

  getEffectiveMusicGain() {
    if (this.muted) return 0;
    return this.masterVolume * this.musicVolume;
  }

  playTone(freq, duration = 0.12, type = 'sine', gainMult = 0.18, slideTo = null) {
    const vol = this.getEffectiveSfxGain() * gainMult;
    if (vol <= 0.001) return;
    this.resume();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playClick() {
    this.playTone(520, 0.055, 'triangle', 0.14, 680);
  }

  playBuild() {
    this.playTone(260, 0.11, 'square', 0.12, 390);
    setTimeout(() => this.playTone(440, 0.14, 'triangle', 0.15, 520), 65);
  }

  playComplete() {
    this.playTone(392, 0.12, 'triangle', 0.16);
    setTimeout(() => this.playTone(523.25, 0.14, 'triangle', 0.16), 90);
    setTimeout(() => this.playTone(659.25, 0.22, 'sine', 0.18), 180);
  }

  playDig() {
    this.playTone(145, 0.08, 'sawtooth', 0.12, 85);
  }

  playResearch() {
    this.playTone(440, 0.14, 'sine', 0.16);
    setTimeout(() => this.playTone(554.37, 0.14, 'sine', 0.16), 110);
    setTimeout(() => this.playTone(659.25, 0.16, 'sine', 0.16), 220);
    setTimeout(() => this.playTone(880, 0.3, 'triangle', 0.18), 330);
  }

  playAlert() {
    this.playTone(310, 0.16, 'sawtooth', 0.15, 250);
    setTimeout(() => this.playTone(260, 0.22, 'sawtooth', 0.15, 200), 170);
  }

  startAmbientMusic() {
    if (this.musicPlaying || typeof window === 'undefined') return;
    this.musicPlaying = true;
    const chords = [
      [110.0, 164.81, 220.0, 261.63], // Am7 subterranean pad
      [98.0, 146.83, 196.0, 246.94],  // Gmaj7 horizon
      [87.31, 130.81, 174.61, 220.0], // Fmaj7 deep earth
      [110.0, 164.81, 246.94, 293.66] // Am9 hope
    ];

    const triggerPad = () => {
      if (!this.musicPlaying) return;
      const gainLevel = this.getEffectiveMusicGain() * 0.045;
      if (gainLevel > 0.001 && this.ctx && this.ctx.state === 'running') {
        const chord = chords[this.chordIndex % chords.length];
        this.chordIndex++;
        const now = this.ctx.currentTime;
        for (const freq of chord) {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(0.0005, now);
          gain.gain.linearRampToValueAtTime(gainLevel, now + 1.8);
          gain.gain.exponentialRampToValueAtTime(0.0005, now + 5.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(now);
          osc.stop(now + 5.8);
        }
      }
      this.musicTimer = setTimeout(triggerPad, 5500);
    };

    this.musicTimer = setTimeout(triggerPad, 1200);
  }

  stopAmbientMusic() {
    this.musicPlaying = false;
    if (this.musicTimer) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audio = new AudioSystem();
