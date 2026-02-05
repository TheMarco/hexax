export class EntityManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.enemies = [];
    this.bullets = [];
    this.walls = [];
    this.doublewalls = [];
  }

  addEnemy(enemy) {
    this.enemies.push(enemy);
  }

  addBullet(bullet) {
    this.bullets.push(bullet);
  }

  addWall(wall) {
    this.walls.push(wall);
  }

  addDoubleWall(dw) {
    this.doublewalls.push(dw);
  }

  removeDeadBullets() {
    this.bullets = this.bullets.filter(b => b.alive);
  }

  removeDeadEnemies() {
    this.enemies = this.enemies.filter(e => e.alive);
  }

  removeDeadEnemiesAndWalls() {
    this.enemies = this.enemies.filter(e => e.alive);
    this.walls = this.walls.filter(w => w.alive);
    this.doublewalls = this.doublewalls.filter(dw => dw.alive);
  }
}
