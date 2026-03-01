import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener, signal, Inject, PLATFORM_ID } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { CommonModule, isPlatformBrowser } from '@angular/common';

const TILE_SIZE = 40;
const MAP_WIDTH = 20;
const MAP_HEIGHT = 15;
const MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,1,1,0,0,0,0,0,0,0,0,1,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

interface Rect { x: number; y: number; w: number; h: number; }

interface Entity extends Rect {
  type?: string;
  vx?: number;
  vy?: number;
  hp?: number;
  maxHp?: number;
  speed?: number;
  dir?: number | string;
  shootTimer?: number;
  hurtTimer?: number;
  timer?: number;
  kills?: number;
}

class SoundEngine {
  ctx: AudioContext | null = null;

  init() {
    if (!this.ctx && typeof window !== 'undefined' && (window.AudioContext || (window as any).webkitAudioContext)) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playFart() {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.3);
    
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playEat() {
    this.playTone(600, 'square', 0.1, 0.1);
    setTimeout(() => this.playTone(800, 'square', 0.1, 0.1), 100);
  }

  playLife() {
    this.playTone(400, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(500, 'sine', 0.1, 0.1), 100);
    setTimeout(() => this.playTone(600, 'sine', 0.2, 0.1), 200);
  }

  playEnemyDie() {
    this.playTone(150, 'square', 0.2, 0.1);
  }

  playBossHurt() {
    this.playTone(100, 'sawtooth', 0.2, 0.2);
  }

  playBossDie() {
    this.playTone(100, 'sawtooth', 0.5, 0.3);
    setTimeout(() => this.playTone(80, 'sawtooth', 0.5, 0.3), 200);
    setTimeout(() => this.playTone(60, 'sawtooth', 0.8, 0.3), 400);
  }

  playPlayerHurt() {
    this.playTone(200, 'sawtooth', 0.3, 0.2);
    setTimeout(() => this.playTone(150, 'sawtooth', 0.3, 0.2), 100);
  }

  playGameOver() {
    this.playTone(300, 'square', 0.4, 0.2);
    setTimeout(() => this.playTone(250, 'square', 0.4, 0.2), 300);
    setTimeout(() => this.playTone(200, 'square', 0.8, 0.2), 600);
  }
}

class GameEngine {
  player = { x: 400, y: 500, w: 30, h: 30, speed: 200, dir: 'up', food: 0, lives: 3, invuln: 0 };
  enemies: Entity[] = [];
  projectiles: Entity[] = [];
  items: Entity[] = [];
  farts: Entity[] = [];
  level = 1;
  score = 0;
  keys: Record<string, boolean> = {};
  boss: Entity | null = null;
  fartCooldown = 0;
  fartCount = 0;
  sounds = new SoundEngine();

  onGameOver: () => void = () => undefined;
  onLevelComplete: () => void = () => undefined;
  onScoreChange: (score: number) => void = () => undefined;
  onLivesChange: (lives: number) => void = () => undefined;
  onFoodChange: (food: number) => void = () => undefined;

  startLevel(level: number) {
    this.level = level;
    this.player.x = 400;
    this.player.y = 500;
    this.player.dir = 'up';
    this.player.invuln = 2;
    this.enemies = [];
    this.projectiles = [];
    this.items = [];
    this.farts = [];

    this.boss = {
      x: 370, y: 60, w: 60, h: 60,
      hp: 5 + level * 3, maxHp: 5 + level * 3,
      speed: 80 + level * 10, dir: 1, shootTimer: 2,
      hurtTimer: 0
    };

    const numEnemies = 3 + level * 2;
    for (let i = 0; i < numEnemies; i++) {
      let ex, ey;
      do {
        ex = Math.random() * (800 - 80) + 40;
        ey = Math.random() * (400 - 120) + 120;
      } while (this.collidesWithWall({x: ex, y: ey, w: 30, h: 30}));

      const type = Math.random() > 0.5 ? 'poop' : 'person';
      this.enemies.push({
        x: ex, y: ey, w: 26, h: 26, type,
        vx: type === 'person' ? (Math.random() > 0.5 ? 1 : -1) * 100 : 0,
        vy: type === 'person' ? (Math.random() > 0.5 ? 1 : -1) * 100 : 0,
      });
    }

    for (let i = 0; i < Math.max(1, Math.floor(level / 2)); i++) {
      let bx, by;
      do {
        bx = Math.random() * (800 - 80) + 40;
        by = Math.random() * (400 - 120) + 120;
      } while (this.collidesWithWall({x: bx, y: by, w: 16, h: 16}));
      this.items.push({ x: bx, y: by, w: 16, h: 16, type: 'bad_food' });
    }
  }

  update(dt: number) {
    let dx = 0, dy = 0;
    if (this.keys['ArrowUp']) { dy -= this.player.speed * dt; this.player.dir = 'up'; }
    if (this.keys['ArrowDown']) { dy += this.player.speed * dt; this.player.dir = 'down'; }
    if (this.keys['ArrowLeft']) { dx -= this.player.speed * dt; this.player.dir = 'left'; }
    if (this.keys['ArrowRight']) { dx += this.player.speed * dt; this.player.dir = 'right'; }

    if (dx !== 0 || dy !== 0) {
      this.moveEntity(this.player, dx, dy);
    }

    if (this.fartCooldown > 0) this.fartCooldown -= dt;
    if (this.keys[' '] && this.fartCooldown <= 0) {
      this.fartCooldown = 0.5;
      this.sounds.playFart();
      
      this.fartCount++;
      if (this.fartCount >= 10) {
        this.fartCount = 0;
        if (this.player.food > 0) {
          this.player.food--;
          this.onFoodChange(this.player.food);
        }
      }

      const growth = this.player.food * 20;
      let fx = this.player.x, fy = this.player.y, fw = this.player.w, fh = this.player.h;
      let fartDir = '';

      if (this.player.dir === 'up') { 
        fartDir = 'down';
        fx -= growth / 2;
        fw += growth;
        fy += this.player.h; 
        fh = 40 + growth; 
      }
      else if (this.player.dir === 'down') { 
        fartDir = 'up';
        fx -= growth / 2;
        fw += growth;
        fy -= (40 + growth); 
        fh = 40 + growth; 
      }
      else if (this.player.dir === 'left') { 
        fartDir = 'right';
        fy -= growth / 2;
        fh += growth;
        fx += this.player.w; 
        fw = 40 + growth; 
      }
      else if (this.player.dir === 'right') { 
        fartDir = 'left';
        fy -= growth / 2;
        fh += growth;
        fx -= (40 + growth); 
        fw = 40 + growth; 
      }

      const clipped = this.clipFart(fx, fy, fw, fh, fartDir);
      if (clipped.w > 0 && clipped.h > 0) {
        this.farts.push({ x: clipped.x, y: clipped.y, w: clipped.w, h: clipped.h, timer: 0.3, kills: 0 });
      }
    }

    for (let i = this.farts.length - 1; i >= 0; i--) {
      this.farts[i].timer! -= dt;
      if (this.farts[i].timer! <= 0) {
        this.farts.splice(i, 1);
      }
    }

    if (this.boss) {
      this.boss.x += this.boss.speed! * (this.boss.dir as number) * dt;
      if (this.boss.x < 40) { this.boss.x = 40; this.boss.dir = 1; }
      if (this.boss.x > 800 - 40 - this.boss.w) { this.boss.x = 800 - 40 - this.boss.w; this.boss.dir = -1; }

      if (this.boss.hurtTimer! > 0) this.boss.hurtTimer! -= dt;

      this.boss.shootTimer! -= dt;
      if (this.boss.shootTimer! <= 0) {
        this.boss.shootTimer = Math.max(0.5, 2 - this.level * 0.2);
        const dx = this.player.x - this.boss.x;
        const dy = this.player.y - this.boss.y;
        const dist = Math.hypot(dx, dy);
        this.projectiles.push({
          x: this.boss.x + this.boss.w/2 - 8,
          y: this.boss.y + this.boss.h,
          w: 16, h: 16,
          vx: (dx / dist) * 150,
          vy: (dy / dist) * 150,
          type: 'toxic'
        });
      }
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.type === 'poop') {
        const dx = this.player.x - e.x;
        const dy = this.player.y - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0) {
          e.vx = (dx / dist) * 50;
          e.vy = (dy / dist) * 50;
        }
      } else if (e.type === 'person') {
        if (this.collidesWithWall({x: e.x + e.vx! * dt, y: e.y, w: e.w, h: e.h})) e.vx! *= -1;
        if (this.collidesWithWall({x: e.x, y: e.y + e.vy! * dt, w: e.w, h: e.h})) e.vy! *= -1;
      }
      this.moveEntity(e, e.vx! * dt, e.vy! * dt);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx! * dt;
      p.y += p.vy! * dt;
      if (this.collidesWithWall(p)) {
        this.projectiles.splice(i, 1);
      }
    }

    if (this.player.invuln > 0) this.player.invuln -= dt;

    if (this.player.invuln <= 0) {
      let hit = false;
      for (const e of this.enemies) {
        if (this.rectIntersect(this.player, e)) hit = true;
      }
      for (const p of this.projectiles) {
        if (this.rectIntersect(this.player, p)) hit = true;
      }
      if (this.boss && this.rectIntersect(this.player, this.boss)) hit = true;

      if (hit) {
        this.player.lives--;
        this.onLivesChange(this.player.lives);
        this.player.invuln = 2;
        if (this.player.lives <= 0) {
          this.sounds.playGameOver();
          this.onGameOver();
          return;
        } else {
          this.sounds.playPlayerHurt();
        }
      }
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      if (this.rectIntersect(this.player, item)) {
        if (item.type === 'food') {
          this.player.food++;
          this.onFoodChange(this.player.food);
          this.score += 50;
          this.sounds.playEat();
        } else if (item.type === 'bad_food') {
          this.player.food = Math.max(0, this.player.food - 2);
          this.onFoodChange(this.player.food);
          this.score -= 20;
          this.sounds.playPlayerHurt();
        } else if (item.type === 'life') {
          this.player.lives++;
          this.onLivesChange(this.player.lives);
          this.score += 100;
          this.sounds.playLife();
        }
        this.onScoreChange(this.score);
        this.items.splice(i, 1);
      }
    }

    for (const f of this.farts) {
      if (f.kills! < 3) {
        let hitEnemies = [];
        for (let i = 0; i < this.enemies.length; i++) {
          if (this.rectIntersect(f, this.enemies[i])) {
            hitEnemies.push(this.enemies[i]);
          }
        }
        hitEnemies.sort((a, b) => {
          const distA = Math.hypot(a.x! - this.player.x, a.y! - this.player.y);
          const distB = Math.hypot(b.x! - this.player.x, b.y! - this.player.y);
          return distA - distB;
        });

        for (const hit of hitEnemies) {
          if (f.kills! >= 3) break;
          const eIndex = this.enemies.indexOf(hit);
          if (eIndex !== -1) {
            if (Math.random() < 0.3) {
              const rand = Math.random();
              const type = rand < 0.2 ? 'life' : (rand < 0.5 ? 'bad_food' : 'food');
              this.items.push({
                x: hit.x, y: hit.y, w: 16, h: 16, type
              });
            }
            this.enemies.splice(eIndex, 1);
            this.score += 10;
            this.onScoreChange(this.score);
            this.sounds.playEnemyDie();
            f.kills!++;
          }
        }
      }

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        if (this.rectIntersect(f, this.projectiles[i])) {
          this.projectiles.splice(i, 1);
          this.score += 5;
          this.onScoreChange(this.score);
        }
      }
      if (this.boss && this.boss.hurtTimer! <= 0 && this.rectIntersect(f, this.boss)) {
        this.boss.hp!--;
        this.boss.hurtTimer = 0.5;
        this.score += 20;
        this.onScoreChange(this.score);
        if (this.boss.hp! <= 0) {
          this.boss = null;
          this.score += 1000 * this.level;
          this.onScoreChange(this.score);
          this.sounds.playBossDie();
          this.onLevelComplete();
        } else {
          this.sounds.playBossHurt();
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 800, 600);

    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        if (MAP[y][x] === 1) {
          ctx.fillStyle = '#444';
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.fillStyle = '#555';
          ctx.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
        } else {
          ctx.fillStyle = '#333';
          ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = '#2a2a2a';
          ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    for (const item of this.items) {
      if (item.type === 'food') {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.fillStyle = '#FFA500';
        ctx.fillRect(item.x + 2, item.y + 2, item.w - 4, item.h - 4);
      } else if (item.type === 'bad_food') {
        ctx.fillStyle = '#00008B';
        ctx.fillRect(item.x, item.y, item.w, item.h);
        ctx.fillStyle = '#4169E1';
        ctx.fillRect(item.x + 2, item.y + 2, item.w - 4, item.h - 4);
      } else if (item.type === 'life') {
        ctx.fillStyle = '#f00';
        ctx.fillRect(item.x, item.y, item.w, item.h);
      }
    }

    for (const e of this.enemies) {
      if (e.type === 'poop') {
        ctx.fillStyle = '#5c4033';
        ctx.beginPath();
        ctx.arc(e.x + e.w/2, e.y + e.h/2 + 4, e.w/2, 0, Math.PI*2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(e.x + e.w/2, e.y + e.h/2 - 4, e.w/2 - 4, 0, Math.PI*2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#ffb6c1';
        ctx.fillRect(e.x, e.y, e.w, e.h);
        ctx.fillStyle = '#000';
        ctx.fillRect(e.x + 4, e.y + 4, 4, 4);
        ctx.fillRect(e.x + e.w - 8, e.y + 4, 4, 4);
      }
    }

    if (this.boss) {
      if (this.boss.hurtTimer! > 0 && Math.floor(this.boss.hurtTimer! * 10) % 2 === 0) {
        ctx.fillStyle = '#f00';
      } else {
        ctx.fillStyle = '#fff';
      }
      ctx.fillRect(this.boss.x, this.boss.y, this.boss.w, this.boss.h);
      ctx.fillStyle = '#ccc';
      ctx.fillRect(this.boss.x + 10, this.boss.y + 10, this.boss.w - 20, this.boss.h - 20);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(this.boss.x + 15, this.boss.y + 15, this.boss.w - 30, this.boss.h - 30);

      ctx.fillStyle = '#000';
      ctx.fillRect(this.boss.x, this.boss.y - 10, this.boss.w, 6);
      ctx.fillStyle = '#f00';
      ctx.fillRect(this.boss.x, this.boss.y - 10, this.boss.w * (this.boss.hp! / this.boss.maxHp!), 6);
    }

    for (const p of this.projectiles) {
      ctx.fillStyle = '#0f0';
      ctx.beginPath();
      ctx.arc(p.x + p.w/2, p.y + p.h/2, p.w/2, 0, Math.PI*2);
      ctx.fill();
    }

    for (const f of this.farts) {
      ctx.fillStyle = `rgba(139, 69, 19, ${f.timer! / 0.3 * 0.8})`;
      ctx.fillRect(f.x, f.y, f.w, f.h);
    }

    if (this.player.invuln <= 0 || Math.floor(this.player.invuln * 10) % 2 === 0) {
      ctx.fillStyle = '#fca311';
      ctx.fillRect(this.player.x, this.player.y, this.player.w, this.player.h);
      ctx.fillStyle = '#000';
      if (this.player.dir === 'right') {
        ctx.fillRect(this.player.x + this.player.w - 8, this.player.y + 6, 4, 4);
      } else if (this.player.dir === 'left') {
        ctx.fillRect(this.player.x + 4, this.player.y + 6, 4, 4);
      } else if (this.player.dir === 'down') {
        ctx.fillRect(this.player.x + 6, this.player.y + 6, 4, 4);
        ctx.fillRect(this.player.x + this.player.w - 10, this.player.y + 6, 4, 4);
      }
    }
  }

  moveEntity(ent: Rect, dx: number, dy: number) {
    ent.x += dx;
    if (this.collidesWithWall(ent)) {
      ent.x -= dx;
    }
    ent.y += dy;
    if (this.collidesWithWall(ent)) {
      ent.y -= dy;
    }
  }

  collidesWithWall(ent: Rect) {
    const left = Math.floor(ent.x / TILE_SIZE);
    const right = Math.floor((ent.x + ent.w - 0.1) / TILE_SIZE);
    const top = Math.floor(ent.y / TILE_SIZE);
    const bottom = Math.floor((ent.y + ent.h - 0.1) / TILE_SIZE);
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        if (MAP[y] && MAP[y][x] === 1) return true;
      }
    }
    return false;
  }

  clipFart(fx: number, fy: number, fw: number, fh: number, dir: string) {
    const isWall = (cx: number, cy: number) => {
      if (cy < 0 || cy >= MAP_HEIGHT || cx < 0 || cx >= MAP_WIDTH) return true;
      return MAP[cy][cx] === 1;
    };

    const cx = Math.floor((fx + fw / 2) / TILE_SIZE);
    const cy = Math.floor((fy + fh / 2) / TILE_SIZE);

    if (dir === 'down') {
      let maxH = fh;
      for (let y = Math.floor(fy / TILE_SIZE); y <= Math.floor((fy + fh - 0.1) / TILE_SIZE); y++) {
        if (isWall(cx, y)) {
          maxH = y * TILE_SIZE - fy;
          break;
        }
      }
      return { x: fx, y: fy, w: fw, h: Math.max(0, maxH) };
    }
    if (dir === 'up') {
      let maxH = fh;
      let newFy = fy;
      for (let y = Math.floor((fy + fh - 0.1) / TILE_SIZE); y >= Math.floor(fy / TILE_SIZE); y--) {
        if (isWall(cx, y)) {
          const wallBottom = (y + 1) * TILE_SIZE;
          maxH = (fy + fh) - wallBottom;
          newFy = wallBottom;
          break;
        }
      }
      return { x: fx, y: newFy, w: fw, h: Math.max(0, maxH) };
    }
    if (dir === 'right') {
      let maxW = fw;
      for (let x = Math.floor(fx / TILE_SIZE); x <= Math.floor((fx + fw - 0.1) / TILE_SIZE); x++) {
        if (isWall(x, cy)) {
          maxW = x * TILE_SIZE - fx;
          break;
        }
      }
      return { x: fx, y: fy, w: Math.max(0, maxW), h: fh };
    }
    if (dir === 'left') {
      let maxW = fw;
      let newFx = fx;
      for (let x = Math.floor((fx + fw - 0.1) / TILE_SIZE); x >= Math.floor(fx / TILE_SIZE); x--) {
        if (isWall(x, cy)) {
          const wallRight = (x + 1) * TILE_SIZE;
          maxW = (fx + fw) - wallRight;
          newFx = wallRight;
          break;
        }
      }
      return { x: newFx, y: fy, w: Math.max(0, maxW), h: fh };
    }
    return { x: fx, y: fy, w: fw, h: fh };
  }

  rectIntersect(r1: Rect, r2: Rect) {
    return !(r2.x > r1.x + r1.w || 
             r2.x + r2.w < r1.x || 
             r2.y > r1.y + r1.h ||
             r2.y + r2.h < r1.y);
  }
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  gameState = signal<'MENU' | 'PLAYING' | 'GAME_OVER' | 'LEVEL_TRANSITION' | 'ENTER_HIGHSCORE' | 'HIGHSCORE_LIST'>('MENU');
  score = signal(0);
  lives = signal(3);
  food = signal(0);
  level = signal(1);

  highscores = signal<{initials: string, score: number}[]>([]);
  initialsControl = new FormControl('', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]);

  engine!: GameEngine;
  animationFrameId = 0;
  lastTime = 0;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.loadHighscores();
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    this.engine = new GameEngine();
    this.engine.onGameOver = () => {
      this.gameState.set('ENTER_HIGHSCORE');
    };
    this.engine.onLevelComplete = () => {
      this.gameState.set('LEVEL_TRANSITION');
      setTimeout(() => {
        this.level.update(l => l + 1);
        this.engine.startLevel(this.level());
        this.gameState.set('PLAYING');
      }, 3000);
    };
    this.engine.onScoreChange = (s) => this.score.set(s);
    this.engine.onLivesChange = (l) => this.lives.set(l);
    this.engine.onFoodChange = (f) => this.food.set(f);

    this.lastTime = performance.now();
    const loop = (time: number) => {
      const dt = (time - this.lastTime) / 1000;
      this.lastTime = time;

      if (this.gameState() === 'PLAYING') {
        this.engine.update(dt);
      }

      if (this.gameState() === 'PLAYING' || this.gameState() === 'LEVEL_TRANSITION') {
        this.engine.draw(ctx);
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  ngOnDestroy() {
    if (isPlatformBrowser(this.platformId)) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent) {
    if (this.engine) this.engine.keys[e.key] = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key) && this.gameState() === 'PLAYING') {
      e.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent) {
    if (this.engine) this.engine.keys[e.key] = false;
  }

  startGame() {
    this.engine.sounds.init();
    this.level.set(1);
    this.score.set(0);
    this.lives.set(3);
    this.food.set(0);
    this.engine.score = 0;
    this.engine.player.lives = 3;
    this.engine.player.food = 0;
    this.engine.fartCount = 0;
    this.engine.startLevel(1);
    this.gameState.set('PLAYING');
  }

  loadHighscores() {
    if (!isPlatformBrowser(this.platformId)) return;
    const hs = localStorage.getItem('bob_highscores');
    if (hs) {
      this.highscores.set(JSON.parse(hs));
    }
  }

  saveHighscore() {
    if (this.initialsControl.invalid) return;
    const initials = this.initialsControl.value!.toUpperCase();
    const newHs = { initials, score: this.score() };
    const hs = [...this.highscores(), newHs].sort((a, b) => b.score - a.score).slice(0, 7);
    this.highscores.set(hs);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('bob_highscores', JSON.stringify(hs));
    }
    this.initialsControl.reset();
    this.gameState.set('HIGHSCORE_LIST');
  }

  showMenu() {
    this.gameState.set('MENU');
  }
}
