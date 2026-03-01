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
      const range = 40 + this.player.food * 20;
      let fx = this.player.x, fy = this.player.y, fw = this.player.w, fh = this.player.h;
      if (this.player.dir === 'up') { fy -= range; fh = range; }
      if (this.player.dir === 'down') { fy += this.player.h; fh = range; }
      if (this.player.dir === 'left') { fx -= range; fw = range; }
      if (this.player.dir === 'right') { fx += this.player.w; fw = range; }
      this.farts.push({ x: fx, y: fy, w: fw, h: fh, timer: 0.3 });
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
          this.onGameOver();
          return;
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
        } else if (item.type === 'life') {
          this.player.lives++;
          this.onLivesChange(this.player.lives);
          this.score += 100;
        }
        this.onScoreChange(this.score);
        this.items.splice(i, 1);
      }
    }

    for (const f of this.farts) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        if (this.rectIntersect(f, this.enemies[i])) {
          if (Math.random() < 0.3) {
            this.items.push({
              x: this.enemies[i].x, y: this.enemies[i].y, w: 16, h: 16,
              type: Math.random() < 0.2 ? 'life' : 'food'
            });
          }
          this.enemies.splice(i, 1);
          this.score += 10;
          this.onScoreChange(this.score);
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
          this.onLevelComplete();
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
    this.level.set(1);
    this.score.set(0);
    this.lives.set(3);
    this.food.set(0);
    this.engine.score = 0;
    this.engine.player.lives = 3;
    this.engine.player.food = 0;
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
    const hs = [...this.highscores(), newHs].sort((a, b) => b.score - a.score).slice(0, 10);
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
