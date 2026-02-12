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

    // iOS requires AudioContext to be resumed from a user gesture
    const resumeAudio = () => {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      document.removeEventListener('touchstart', resumeAudio);
      document.removeEventListener('touchend', resumeAudio);
      document.removeEventListener('click', resumeAudio);
    };
    document.addEventListener('touchstart', resumeAudio);
    document.addEventListener('touchend', resumeAudio);
    document.addEventListener('click', resumeAudio);

    // Preload all sounds
    this.loadSound('getready', '/sounds/getready.mp3');
    this.loadSound('twist', '/sounds/twist.mp3');
    this.loadSound('shoot', '/sounds/shoot.mp3');
    this.loadSound('explosion', '/sounds/explode.mp3');
    this.loadSound('death', '/sounds/death.mp3');
    this.loadSound('hitwall', '/sounds/hitwall.mp3');
    this.loadSound('heart', '/sounds/heart.mp3');
    this.loadSound('breach', '/sounds/breach.mp3');
    this.loadSound('tank_hit', '/sounds/tank_hit.mp3');
    this.loadSound('tank_kill', '/sounds/tank_kill.mp3');
    this.loadSound('bomb_explode', '/sounds/bomb_explode.mp3');
    this.loadSound('spiral_kill', '/sounds/spiral_kill.mp3');
    this.loadSound('phase_kill', '/sounds/phase_kill.mp3');
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
    if (!this.initialized) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (!this.sounds[name]) return;

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

  playHeart() {
    this.playSound('heart');
  }

  playBreach() {
    this.playSound('breach');
  }

  playTankHit() {
    this.playSound('tank_hit');
  }

  playTankKill() {
    this.playSound('tank_kill');
  }

  playBombExplode() {
    this.playSound('bomb_explode');
  }

  playSpiralKill() {
    this.playSound('spiral_kill');
  }

  playPhaseKill() {
    this.playSound('phase_kill');
  }

  startMusic() {
    if (!this.initialized) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
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

  pauseMusic() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  resumeMusic() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
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
