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

const STEP_ANGLE = Math.PI / 3; // 60° per lane
const ROT_DURATION_MS = 150;    // total time for smooth 60° rotation
const FLASH_DECAY = 4;          // ring flash fades in ~250ms (1/FLASH_DECAY seconds)

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.geometry = new TunnelGeometry();
    this.tunnelRenderer = new TunnelRenderer(this.geometry);
    this.entityRenderer = new EntityRenderer(this.geometry);
    this.state = new GameState();
    this.entityManager = new EntityManager();
    this.explosionRenderer = new ExplosionRenderer();
    this.collisionSystem = new CollisionSystem(this.entityManager, this.state);
    this.collisionSystem.onHit = (lane, depth, prevDepth, color) => {
      const VISUAL_OFFSET = 2;
      const renderLane = this.state.getRenderLane(lane);
      const visualLane = (renderLane + VISUAL_OFFSET) % CONFIG.NUM_LANES;
      const enemyLerp = this.tickSystem.enemyTimer.getProgress();
      const visualDepth = prevDepth + (depth - prevDepth) * enemyLerp;
      const pos = this.geometry.getMidpointLerp(visualDepth, visualLane, this._rotAngle);
      this.explosionRenderer.spawn(pos.x, pos.y, color);
    };
    this.spawnSystem = new SpawnSystem(this.entityManager, this.state);
    this.inputSystem = new InputSystem(this, this.state, this.entityManager);
    this.tickSystem = new TickSystem(this, this.state, this.entityManager, this.collisionSystem, this.spawnSystem);
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
  }

  update(time, delta) {
    this.inputSystem.update();

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

    const bulletLerp = this.tickSystem.bulletTimer.getProgress();
    const enemyLerp = this.tickSystem.enemyTimer.getProgress();

    this.explosionRenderer.update(delta);

    this.tunnelRenderer.draw(this.gfx, activeFaceVertex, this._rotAngle, this._ringFlash);
    this.entityRenderer.draw(this.gfx, this.state, this.entityManager, VISUAL_OFFSET, this._rotAngle, bulletLerp, enemyLerp);
    this.explosionRenderer.draw(this.gfx);
    this.hud.update();
  }
}
