// Simple audio sample playback using Web Audio API

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.initialized = false;
    this.sounds = {};
    this.musicSource = null;
    this.musicGain = null;
  }

  init() {
    if (this.initialized) return;

    // Create AudioContext on user interaction (browser requirement)
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5; // master volume
    this.masterGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.3; // SFX volume (relative to master)
    this.sfxGain.connect(this.masterGain);
    this.initialized = true;

    // Preload all sounds
    this.loadSound('getready', '/sounds/getready.mp3');
    this.loadSound('twist', '/sounds/twist.mp3');
    this.loadSound('shoot', '/sounds/shoot.mp3');
    this.loadSound('explosion', '/sounds/explode.mp3');
    this.loadSound('death', '/sounds/death.mp3');
    this.loadSound('hitwall', '/sounds/hitwall.mp3');
    this.loadSound('soundtrack', '/sounds/soundtrack.mp3');
  }

  async loadSound(name, url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.sounds[name] = await this.ctx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn(`Failed to load ${url}:`, err);
    }
  }

  playSound(name) {
    if (!this.initialized) {
      console.warn(`SoundEngine not initialized, cannot play ${name}`);
      return;
    }
    if (!this.sounds[name]) {
      console.warn(`Sound ${name} not loaded yet`);
      return;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = this.sounds[name];
    source.connect(this.sfxGain);
    source.start(0);
  }

  playGetReady() {
    this.playSound('getready');
  }

  playRotate() {
    this.playSound('twist');
  }

  playFire() {
    this.playSound('shoot');
  }

  playExplosion() {
    this.playSound('explosion');
  }

  playTunnelExplosion() {
    this.playSound('death');
  }

  playHitWall() {
    this.playSound('hitwall');
  }

  startMusic() {
    if (!this.initialized) return;
    if (!this.sounds['soundtrack']) {
      // Buffer still loading — retry shortly
      setTimeout(() => this.startMusic(), 500);
      return;
    }
    this.stopMusic();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 1.0;
    this.musicGain.connect(this.masterGain);
    this.musicSource = this.ctx.createBufferSource();
    this.musicSource.buffer = this.sounds['soundtrack'];
    this.musicSource.loop = true;
    this.musicSource.connect(this.musicGain);
    this.musicSource.start(0);
  }

  stopMusic() {
    if (this.musicSource) {
      try { this.musicSource.stop(); } catch (_) {}
      this.musicSource.disconnect();
      this.musicSource = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  }
}
