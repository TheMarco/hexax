import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { TunnelGeometry } from '../rendering/TunnelGeometry.js';
import { TunnelRenderer } from '../rendering/TunnelRenderer.js';
import { EntityRenderer } from '../rendering/EntityRenderer.js';
import { GameState } from '../state/GameState.js';
import { EntityManager } from '../entities/EntityManager.js';
import { InputSystem } from '../systems/InputSystem.js';
import { TickSystem } from '../systems/TickSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { SpawnSystem } from '../systems/SpawnSystem.js';
import { HUD } from '../hud/HUD.js';
import { ExplosionRenderer } from '../rendering/ExplosionRenderer.js';
import { TunnelExplosionRenderer } from '../rendering/TunnelExplosionRenderer.js';

const STEP_ANGLE = Math.PI / 3; // 60° per lane
const ROT_DURATION_MS = 150;    // total time for smooth 60° rotation
const FLASH_DECAY = 4;          // ring flash fades in ~250ms (1/FLASH_DECAY seconds)
const WOBBLE_DURATION_MS = 150;
const WOBBLE_AMPLITUDE = 0.06;  // radians

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.sound = this.game.registry.get('soundEngine');
    this.sound.stopMusic(); // clean up from previous game if restarting
    this.geometry = new TunnelGeometry();
    this.tunnelRenderer = new TunnelRenderer(this.geometry);
    this.entityRenderer = new EntityRenderer(this.geometry);
    this.state = new GameState();
    this.entityManager = new EntityManager();
    this.explosionRenderer = new ExplosionRenderer();
    this.tunnelExplosion = new TunnelExplosionRenderer(this.geometry);
    this.collisionSystem = new CollisionSystem(this.entityManager, this.state);
    this.collisionSystem.onWallDeflect = () => {
      this.sound.playHitWall();
    };
    this.collisionSystem.onHeartCollect = () => {
      this.sound.playHeart();
    };
    this.collisionSystem.onHit = (lane, depth, prevDepth, color, prevLane) => {
      const VISUAL_OFFSET = 2;
      const renderLane = this.state.getRenderLane(lane);
      const visualLane = (renderLane + VISUAL_OFFSET) % CONFIG.NUM_LANES;
      const enemyLerp = this.tickSystem.enemyTimer.getProgress();
      const visualDepth = prevDepth + (depth - prevDepth) * enemyLerp;
      let pos = this.geometry.getMidpointLerp(visualDepth, visualLane, this._rotAngle);
      if (!pos) return;

      // Interpolate explosion position for lane-changing enemies (spiral)
      if (prevLane !== undefined && prevLane !== lane) {
        const prevRenderLane = this.state.getRenderLane(prevLane);
        const prevVisualLane = (prevRenderLane + VISUAL_OFFSET) % CONFIG.NUM_LANES;
        const prevPos = this.geometry.getMidpointLerp(visualDepth, prevVisualLane, this._rotAngle);
        if (prevPos) {
          pos = {
            x: prevPos.x + (pos.x - prevPos.x) * enemyLerp,
            y: prevPos.y + (pos.y - prevPos.y) * enemyLerp,
          };
        }
      }

      this.explosionRenderer.spawn(pos.x, pos.y, color);
      this.sound.playExplosion();
    };
    this.spawnSystem = new SpawnSystem(this.entityManager, this.state);
    this.inputSystem = new InputSystem(this, this.state, this.entityManager);
    this.inputSystem.onFire = () => {
      this.sound.playFire();
    };
    this.tickSystem = new TickSystem(this, this.state, this.entityManager, this.collisionSystem, this.spawnSystem);
    this.tickSystem.onPlayerHit = (lane, color) => {
      const VISUAL_OFFSET = 2;
      const pos = this.geometry.getMidpointLerp(0, (0 + VISUAL_OFFSET) % CONFIG.NUM_LANES, this._rotAngle);
      this.explosionRenderer.spawn(pos.x, pos.y, color);
      this.sound.playBreach();
    };
    this.tickSystem.onWallHit = (tier) => {
      // Visual feedback per tier
      this.hud.showWarning(tier);

      // Tunnel flash — all rings flash white
      for (let i = 0; i < this._ringFlash.length; i++) {
        this._ringFlash[i] = tier >= 2 ? 1.5 : 1.0;
      }

      // Wobble — brief rotation shake
      this._wobbleElapsed = 0;
      this._wobbleActive = true;
      this._wobbleAmplitude = tier >= 2 ? WOBBLE_AMPLITUDE * 2 : WOBBLE_AMPLITUDE;

      // Bigger explosion for higher tiers
      const VISUAL_OFFSET = 2;
      const pos = this.geometry.getMidpointLerp(0, (0 + VISUAL_OFFSET) % CONFIG.NUM_LANES, this._rotAngle);
      const count = tier >= 2 ? 3 : 1;
      for (let i = 0; i < count; i++) {
        this.explosionRenderer.spawn(pos.x, pos.y, 0xffffff);
      }
    };
    this.tickSystem.onSegmentDamage = (result) => {
      if (result.fatal) return; // game over handles itself
      if (result.critical) {
        this.hud.showIntegrityWarning('HEXAX INTEGRITY CRITICAL!');
      } else {
        this.hud.showIntegrityWarning('HEXAX INTEGRITY COMPROMISED!');
      }
    };
    this.tickSystem.onGameOver = () => {
      this.tunnelExplosion.trigger();
      this.sound.playTunnelExplosion();
      this.sound.stopMusic();
    };
    this.hud = new HUD(this);

    // Ring flash: intensity per ring, set to 1.0 when entities arrive
    this._ringFlash = new Array(CONFIG.NUM_SEGMENTS).fill(0);
    this.tickSystem.onEnemyMove = (depths) => {
      for (const d of depths) {
        if (d >= 0 && d < CONFIG.NUM_SEGMENTS) {
          this._ringFlash[d] = 1.0;
        }
      }
    };

    this.gfx = this.add.graphics();
    this.gfx.setBlendMode(Phaser.BlendModes.ADD);

    // Smooth rotation state
    this._rotAngle = 0;       // current visual offset in radians
    this._rotTarget = 0;      // target angle (STEP_ANGLE or -STEP_ANGLE)
    this._rotElapsed = 0;     // ms elapsed since rotation started
    this._rotActive = false;  // animation in progress
    this._rotDir = 0;         // +1 or -1

    // Wobble state (wall hit shake)
    this._wobbleActive = false;
    this._wobbleElapsed = 0;
    this._wobbleAmplitude = WOBBLE_AMPLITUDE;

    // Play get ready sound on game start, then start music
    this.time.delayedCall(500, () => {
      this.sound.playGetReady();
    });
    this.time.delayedCall(2000, () => {
      this.sound.startMusic();
    });
  }

  get isRotating() {
    return this._rotActive;
  }

  startRotAnim(direction) {
    if (this._rotActive) return;
    this._rotDir = direction;
    this._rotTarget = direction * STEP_ANGLE;
    this._rotElapsed = 0;
    this._rotActive = true;
    this.sound.playRotate();
    // Kill phosphor persistence during rotation to avoid ghosting
    const overlay = this.game.registry.get('shaderOverlay');
    if (overlay) overlay.setPhosphorDecay(0.1);
  }

  update(time, delta) {
    this.inputSystem.update(delta);

    // Smooth rotation animation
    if (this._rotActive) {
      this._rotElapsed += delta;
      const t = Math.min(this._rotElapsed / ROT_DURATION_MS, 1);
      this._rotAngle = this._rotTarget * t;

      if (t >= 1) {
        // Done — apply rotation and reset
        this._rotAngle = 0;
        this._rotActive = false;
        if (this._rotDir === 1) {
          this.state.rotateRight();
        } else if (this._rotDir === -1) {
          this.state.rotateLeft();
        }
        this._rotDir = 0;
        // Restore phosphor persistence
        const overlay = this.game.registry.get('shaderOverlay');
        if (overlay) overlay.setPhosphorDecay(0.78);
      }
    }

    // Wobble overlay (additive to rotation angle)
    let wobbleOffset = 0;
    if (this._wobbleActive) {
      this._wobbleElapsed += delta;
      if (this._wobbleElapsed >= WOBBLE_DURATION_MS) {
        this._wobbleActive = false;
      } else {
        const t = this._wobbleElapsed / WOBBLE_DURATION_MS;
        wobbleOffset = this._wobbleAmplitude * Math.sin(t * Math.PI * 6) * (1 - t);
      }
    }

    // Decay ring flash
    const dt = delta / 1000;
    for (let i = 0; i < this._ringFlash.length; i++) {
      if (this._ringFlash[i] > 0) {
        this._ringFlash[i] = Math.max(0, this._ringFlash[i] - FLASH_DECAY * dt);
      }
    }

    this.gfx.clear();

    const VISUAL_OFFSET = 2;
    const activeFaceVertex = (0 + VISUAL_OFFSET) % CONFIG.NUM_LANES;
    const effectiveRotAngle = this._rotAngle + wobbleOffset;

    const bulletLerp = this.tickSystem.bulletTimer.getProgress();
    const enemyLerp = this.tickSystem.enemyTimer.getProgress();

    this.explosionRenderer.update(delta);
    this.tunnelExplosion.update(delta);

    // Only draw tunnel/entities if not game over
    if (!this.state.gameOver) {
      // Map logical segment damage to visual lanes for the renderer
      const visualDamage = new Array(CONFIG.NUM_LANES).fill(false);
      for (let l = 0; l < CONFIG.NUM_LANES; l++) {
        if (this.state.segmentDamage[l]) {
          const vl = (this.state.getRenderLane(l) + VISUAL_OFFSET) % CONFIG.NUM_LANES;
          visualDamage[vl] = true;
        }
      }
      this.tunnelRenderer.draw(this.gfx, activeFaceVertex, effectiveRotAngle, this._ringFlash, visualDamage);
      this.entityRenderer.draw(this.gfx, this.state, this.entityManager, VISUAL_OFFSET, effectiveRotAngle, bulletLerp, enemyLerp, dt);
    }

    this.explosionRenderer.draw(this.gfx);
    this.tunnelExplosion.draw(this.gfx);
    this.hud.update(delta);
  }
}
