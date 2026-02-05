// Simple audio sample playback using Web Audio API

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.initialized = false;
    this.sounds = {};
  }

  init() {
    if (this.initialized) return;

    // Create AudioContext on user interaction (browser requirement)
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5; // master volume
    this.masterGain.connect(this.ctx.destination);
    this.initialized = true;

    // Preload all sounds
    this.loadSound('getready', '/sounds/getready.mp3');
    this.loadSound('twist', '/sounds/twist.mp3');
    this.loadSound('shoot', '/sounds/shoot.mp3');
    this.loadSound('explosion', '/sounds/explode.mp3');
    this.loadSound('death', '/sounds/death.mp3');
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
    source.connect(this.masterGain);
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
}
