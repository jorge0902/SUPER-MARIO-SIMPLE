import React, { useEffect, useRef, useState } from 'react';

const TILE = 40;
const GRAVITY = 0.6;
const JUMP = -12;
const SPEED = 5;
const MAX_FALL = 15;

type Rect = { x: number; y: number; w: number; h: number };
type Block = Rect & { type: string; origY?: number; bounce?: number; item?: string };
type Enemy = Rect & { vx: number; vy: number; dead: boolean; type: string; dTimer?: number; hp?: number; timer?: number; chase?: boolean; shellState?: 'none' | 'stopped' | 'moving'; patrolStart?: number; patrolEnd?: number; origY?: number; ground?: boolean; };
type Coin = Rect & { collected: boolean };
type PowerUp = Rect & { type: string; vx: number; vy: number; active: boolean };
type Fireball = Rect & { vx: number; vy: number; active: boolean; bounces: number };
type Player = Rect & { vx: number; vy: number; ground: boolean; score: number; coins: number; state: 'small' | 'big' | 'fire'; invinc: number; star: number; facingRight: boolean };

const mapMain = [
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                                ",
  "                                                                                                                                                                                                                                                   P            ",
  "                                                                                                                                                                                                                                                   P            ",
  "                      M                 S                 F                                     H                                                                                                                                              P            ",
  "                                                                                                                                                                                                                                                   P            ",
  "                                      E      E                                   K         E                                                                                                                              Z                        P            ",
  "      B?B?B                        T  ]         E                          T  W  ]         E               B?B?B      E                 T  ]         E       K                                                                                       P            ",
  "                                   |  |       B B B                        |     |       B B B                                          |  |       B B B                                                                                             P            ",
  "GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGLLLLGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG"
];

const mapSecret = [
  "GGGGGGGGGGGGGGGGGGGG",
  "G                  G",
  "G                  G",
  "G                  G",
  "G                  G",
  "G                  G",
  "G      C C C       G",
  "G     C C C C      G",
  "G      C C C       G",
  "G                  G",
  "G                  G",
  "G                  G",
  "G   X  ]           G",
  "G   |  |           G",
  "GGGGGGGGGGGGGGGGGGGG"
];

function parse(mapStr: string[]) {
  const blocks: Block[] = [];
  const enemies: Enemy[] = [];
  const coins: Coin[] = [];
  for (let y = 0; y < mapStr.length; y++) {
    for (let x = 0; x < mapStr[y].length; x++) {
      const c = mapStr[y][x];
      if (['G', 'B', '?', 'T', ']', '|', 'X', 'P', 'L', 'M', 'S', 'F', 'H'].includes(c)) {
        let type = c;
        let item = undefined;
        if (c === 'M') { type = '?'; item = 'mushroom'; }
        if (c === 'S') { type = '?'; item = 'star'; }
        if (c === 'F') { type = '?'; item = 'flower'; }
        blocks.push({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, type, origY: y * TILE, bounce: 0, item });
      } else if (c === 'E') {
        enemies.push({ x: x * TILE, y: y * TILE, w: TILE, h: TILE, vx: -2, vy: 0, dead: false, type: 'goomba', patrolStart: x * TILE - 100, patrolEnd: x * TILE + 100 });
      } else if (c === 'K') {
        enemies.push({ x: x * TILE, y: y * TILE - 10, w: TILE, h: TILE + 10, vx: -2, vy: 0, dead: false, type: 'koopa', shellState: 'none', patrolStart: x * TILE - 150, patrolEnd: x * TILE + 150 });
      } else if (c === 'Z') {
        enemies.push({ x: x * TILE, y: y * TILE, w: TILE*2, h: TILE*2, vx: -2, vy: 0, dead: false, type: 'boss', hp: 3, timer: 0 });
      } else if (c === 'W') {
        enemies.push({ x: x * TILE + 5, y: y * TILE + TILE, w: TILE - 10, h: TILE * 1.5, vx: 0, vy: 0, dead: false, type: 'piranha', origY: y * TILE + TILE, timer: 0 });
      } else if (c === 'C') {
        coins.push({ x: x * TILE + 10, y: y * TILE + 10, w: 20, h: 20, collected: false });
      }
    }
  }
  return { blocks, enemies, coins };
}

function collides(r1: Rect, r2: Rect) {
  return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameStateStr, setGameStateStr] = useState('playing');
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [time, setTime] = useState(400);
  const [characterState, setCharacterState] = useState<'mario' | 'luigi'>('mario');
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
  };

  const playSound = (type: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'jump') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'coin') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, ctx.currentTime);
      osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'stomp') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(); osc.stop(ctx.currentTime + 0.1);
    } else if (type === 'powerup') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(330, ctx.currentTime);
      osc.frequency.setValueAtTime(523, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } else if (type === 'hit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let afId: number;
    let state = 'playing';
    const keys = { left: false, right: false, up: false, down: false };
    let character: 'mario' | 'luigi' = 'mario';
    let timeLeft = 400;
    let frames = 0;

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      if (isDown) initAudio();
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'ArrowLeft') keys.left = isDown;
      if (e.code === 'ArrowRight') keys.right = isDown;
      if (e.code === 'ArrowUp') keys.up = isDown;
      if (e.code === 'ArrowDown') keys.down = isDown;
      if (e.code === 'Space' && isDown) shootFireball();
      if (e.code === 'KeyC' && isDown) {
        character = character === 'mario' ? 'luigi' : 'mario';
        setCharacterState(character);
      }
      if ((e.code === 'KeyP' || e.code === 'Escape') && isDown) {
        if (state === 'playing') {
          state = 'paused';
          setGameStateStr('paused');
        } else if (state === 'paused') {
          state = 'playing';
          setGameStateStr('playing');
        }
      }
    };

    window.addEventListener('keydown', (e) => handleKey(e, true));
    window.addEventListener('keyup', (e) => handleKey(e, false));

    const p: Player = { x: 50, y: 50, w: 30, h: 38, vx: 0, vy: 0, ground: false, score: 0, coins: 0, state: 'small', invinc: 0, star: 0, facingRight: true };
    const rooms = { main: parse(mapMain), secret: parse(mapSecret) };
    let curRoomId: 'main' | 'secret' = 'main';
    let curRoom = rooms[curRoomId];
    let savedPos = { x: 50, y: 50 };
    let respawnPos = { x: 50, y: 50 };
    const cam = { x: 0, y: 0 };
    const powerups: PowerUp[] = [];
    const fireballs: Fireball[] = [];

    const shootFireball = () => {
      if (p.state !== 'fire' || fireballs.filter(f => f.active).length >= 2) return;
      fireballs.push({
        x: p.facingRight ? p.x + p.w : p.x - 10,
        y: p.y + 10,
        w: 10,
        h: 10,
        vx: p.facingRight ? 10 : -10,
        vy: 0,
        active: true,
        bounces: 0
      });
      playSound('jump'); // Reusing jump sound for fireball for now
    };

    const loop = () => {
      if (state === 'playing') update();
      render();
      afId = requestAnimationFrame(loop);
    };

    const damagePlayer = () => {
      if (p.invinc > 0 || p.star > 0) return;
      if (p.state === 'big' || p.state === 'fire') {
        p.state = 'small';
        p.h = 38;
        p.y += 38;
        p.invinc = 60;
        playSound('hit');
      } else {
        p.x = respawnPos.x; p.y = respawnPos.y; p.vx = 0; p.vy = 0;
        curRoomId = 'main'; curRoom = rooms[curRoomId];
        p.invinc = 60;
        timeLeft = 400;
        setTime(timeLeft);
        playSound('hit');
      }
    };

    const update = () => {
      frames++;
      if (frames % 60 === 0) {
        timeLeft--;
        setTime(timeLeft);
        if (timeLeft <= 0) {
          p.state = 'small'; p.h = 38; p.invinc = 0; p.star = 0;
          damagePlayer();
        }
      }

      if (p.invinc > 0) p.invinc--;
      if (p.star > 0) p.star--;

      const currentGravity = character === 'luigi' ? 0.4 : GRAVITY;
      const currentJump = character === 'luigi' ? -14 : JUMP;

      if (keys.left) { p.vx = -SPEED; p.facingRight = false; }
      else if (keys.right) { p.vx = SPEED; p.facingRight = true; }
      else p.vx = 0;

      p.x += p.vx;

      for (const b of curRoom.blocks) {
        if (collides(p, b) && !['P', 'L'].includes(b.type)) {
          if (p.vx > 0) p.x = b.x - p.w;
          else if (p.vx < 0) p.x = b.x + b.w;
          p.vx = 0;
        }
      }

      p.vy += currentGravity;
      if (p.vy > MAX_FALL) p.vy = MAX_FALL;
      p.y += p.vy;
      p.ground = false;

      for (const b of curRoom.blocks) {
        if (collides(p, b)) {
          if (b.type === 'H') {
            respawnPos = { x: b.x, y: b.y - p.h };
            continue;
          }
          if (b.type === 'L') {
            p.state = 'small'; p.h = 38; p.invinc = 0; p.star = 0;
            damagePlayer();
            continue;
          }
          if (b.type !== 'P') {
            if (p.vy > 0) {
              p.y = b.y - p.h; p.ground = true; p.vy = 0;
            } else if (p.vy < 0) {
              p.y = b.y + b.h; p.vy = 0;
              if (b.type === '?') {
                b.type = 'B'; b.bounce = -10;
                if (b.item === 'mushroom') {
                  powerups.push({ x: b.x, y: b.y - TILE, w: TILE, h: TILE, type: 'mushroom', vx: 2, vy: -5, active: true });
                  playSound('powerup');
                } else if (b.item === 'star') {
                  powerups.push({ x: b.x, y: b.y - TILE, w: TILE, h: TILE, type: 'star', vx: 3, vy: -8, active: true });
                  playSound('powerup');
                } else if (b.item === 'flower') {
                  powerups.push({ x: b.x, y: b.y - TILE, w: TILE, h: TILE, type: 'flower', vx: 0, vy: 0, active: true });
                  playSound('powerup');
                } else {
                  p.coins++; p.score += 100; playSound('coin');
                }
              } else if (b.type === 'B') {
                b.bounce = -10;
              }
            }
          }
        }
      }

      for (const b of curRoom.blocks) {
        if (b.bounce !== undefined && b.bounce < 0) {
          b.bounce += 2; b.y = (b.origY || b.y) + b.bounce;
        }
      }

      if (keys.up && p.ground) { p.vy = currentJump; p.ground = false; playSound('jump'); }

      if (keys.down && p.ground) {
        for (const b of curRoom.blocks) {
          if (b.type === 'T' && collides(p, { ...b, y: b.y - 5 })) {
            curRoomId = 'secret'; curRoom = rooms[curRoomId];
            savedPos = { x: p.x, y: p.y - TILE };
            p.x = 4 * TILE; p.y = 2 * TILE; p.vx = 0; p.vy = 0; keys.down = false; break;
          }
          if (b.type === 'X' && collides(p, { ...b, y: b.y - 5 })) {
            curRoomId = 'main'; curRoom = rooms[curRoomId];
            p.x = savedPos.x; p.y = savedPos.y; p.vy = JUMP; keys.down = false; break;
          }
        }
      }

      // Powerups
      for (const pu of powerups) {
        if (!pu.active) continue;
        pu.vy += GRAVITY;
        pu.x += pu.vx;
        for (const b of curRoom.blocks) {
          if (collides(pu, b) && !['P', 'L'].includes(b.type)) {
            if (pu.vx > 0) { pu.x = b.x - pu.w; pu.vx *= -1; }
            else if (pu.vx < 0) { pu.x = b.x + b.w; pu.vx *= -1; }
          }
        }
        pu.y += pu.vy;
        for (const b of curRoom.blocks) {
          if (collides(pu, b) && !['P', 'L'].includes(b.type)) {
            if (pu.vy > 0) { pu.y = b.y - pu.h; pu.vy = pu.type === 'star' ? -8 : 0; }
          }
        }
        if (collides(p, pu)) {
          pu.active = false;
          if (pu.type === 'mushroom') {
            if (p.state === 'small') { p.state = 'big'; p.h = 76; p.y -= 38; }
            p.score += 1000; playSound('powerup');
          } else if (pu.type === 'star') {
            p.star = 600; p.score += 1000; playSound('powerup');
          } else if (pu.type === 'flower') {
            if (p.state === 'small') { p.y -= 38; }
            p.state = 'fire'; p.h = 76; p.score += 1000; playSound('powerup');
          }
        }
      }

      const newEnemies: Enemy[] = [];

      // Enemies
      for (const e of curRoom.enemies) {
        if (e.dead) {
          if (e.dTimer !== undefined) e.dTimer--;
          continue;
        }

        const distToPlayer = Math.abs(p.x - e.x);
        const yDistToPlayer = Math.abs(p.y - e.y);

        if (e.type === 'piranha') {
          e.timer = (e.timer || 0) + 1;
          const cycle = e.timer % 240;
          if (cycle < 120) {
            // Hidden
            if (distToPlayer > 100) {
              e.y = (e.origY || 0);
            } else {
              e.timer--; // Wait if player is near
            }
          } else if (cycle < 150) {
            // Emerging
            e.y -= 1.5;
          } else if (cycle < 210) {
            // Fully out
          } else {
            // Retreating
            e.y += 1.5;
          }
        } else if (e.type === 'boss') {
          e.timer = (e.timer || 0) + 1;
          const phase = e.timer % 400;
          
          if (phase === 0) {
            // Jump
            e.vy = JUMP;
            e.vx = p.x < e.x ? -3 : 3;
          } else if (phase === 150) {
            // Charge
            e.vx = p.x < e.x ? -8 : 8;
          } else if (phase === 250) {
            // Stop charging
            e.vx = 0;
          } else if (phase === 300 || phase === 330) {
            // Shoot projectile
            newEnemies.push({
              x: e.x + e.w / 2, y: e.y + e.h / 2, w: 15, h: 15,
              vx: p.x < e.x ? -6 : 6, vy: 0, dead: false, type: 'boss_proj'
            });
            playSound('jump');
          }
        } else if (e.type === 'boss_proj') {
          // Projectile moves straight
          e.x += e.vx;
          let hitWall = false;
          for (const b of curRoom.blocks) {
            if (collides(e, b) && !['P', 'L'].includes(b.type)) {
               hitWall = true;
            }
          }
          if (hitWall || e.x < cam.x || e.x > cam.x + 800) e.dead = true;
        } else {
          // Patrol and Chase for Goomba and Koopa
          if (e.shellState !== 'stopped' && e.shellState !== 'moving') {
            if (distToPlayer < 250 && yDistToPlayer < 100) {
              e.chase = true;
              e.vx = p.x > e.x ? 3 : -3;
            } else {
              e.chase = false;
              if (e.vx === 0) e.vx = -2;
              if (Math.abs(e.vx) > 2) e.vx = e.vx > 0 ? 2 : -2; // Reset speed
              if (e.patrolStart !== undefined && e.x < e.patrolStart) e.vx = Math.abs(e.vx);
              if (e.patrolEnd !== undefined && e.x > e.patrolEnd) e.vx = -Math.abs(e.vx);
            }
          }
        }

        if (e.type !== 'piranha') {
          e.vy += GRAVITY;
          e.x += e.vx;

          let hitWall = false;
          for (const b of curRoom.blocks) {
            if (collides(e, b) && !['P', 'L'].includes(b.type)) {
              if (e.vx > 0) { e.x = b.x - e.w; e.vx *= -1; hitWall = true; }
              else if (e.vx < 0) { e.x = b.x + b.w; e.vx *= -1; hitWall = true; }
            }
          }

          // Edge detection for patrolling enemies
          if (!e.chase && e.ground && e.shellState !== 'moving') {
            const edgeX = e.vx > 0 ? e.x + e.w + 5 : e.x - 5;
            const edgeY = e.y + e.h + 5;
            let hasFloor = false;
            for (const b of curRoom.blocks) {
              if (!['P', 'L'].includes(b.type) && edgeX > b.x && edgeX < b.x + b.w && edgeY > b.y && edgeY < b.y + b.h) {
                hasFloor = true;
                break;
              }
            }
            if (!hasFloor) {
              e.vx *= -1;
            }
          }

          e.ground = false;
          e.y += e.vy;
          for (const b of curRoom.blocks) {
            if (collides(e, b) && !['P', 'L'].includes(b.type)) {
              if (e.vy > 0) { e.y = b.y - e.h; e.vy = 0; e.ground = true; }
            }
          }
        }

        // Koopa Shell hitting other enemies
        if (e.shellState === 'moving') {
          for (const other of curRoom.enemies) {
            if (other !== e && !other.dead && collides(e, other)) {
              other.dead = true; other.dTimer = 30; other.h /= 2; other.y += other.h; p.score += 200; playSound('stomp');
            }
          }
        }

        if (collides(p, e)) {
          if (p.star > 0) {
            e.dead = true; e.dTimer = 30; e.h /= 2; e.y += e.h; p.score += 200; playSound('stomp');
          } else if (e.shellState === 'stopped') {
            // Kick the shell
            e.shellState = 'moving';
            e.vx = p.x < e.x ? 8 : -8;
            p.score += 100;
            playSound('stomp');
            p.x = p.x < e.x ? e.x - p.w - 1 : e.x + e.w + 1; // Prevent immediate re-collision
          } else if (p.vy > 0 && p.y + p.h < e.y + e.h / 2 + 10 && e.type !== 'boss_proj') {
            if (e.type === 'boss') {
              e.hp = (e.hp || 0) - 1;
              p.vy = JUMP; playSound('stomp');
              if (e.hp <= 0) { e.dead = true; e.dTimer = 60; p.score += 5000; }
            } else if (e.type === 'koopa') {
              if (e.shellState === 'moving') {
                e.shellState = 'stopped'; e.vx = 0; p.vy = JUMP; playSound('stomp');
              } else {
                e.shellState = 'stopped'; e.vx = 0; e.chase = false; p.vy = JUMP; p.score += 100; playSound('stomp');
              }
            } else if (e.type !== 'piranha') {
              e.dead = true; e.dTimer = 30; e.h /= 2; e.y += e.h; p.vy = JUMP / 1.5; p.score += 100; playSound('stomp');
            } else {
              damagePlayer();
            }
          } else {
            damagePlayer();
          }
        }
      }

      curRoom.enemies.push(...newEnemies);

      // Fireballs
      for (let i = fireballs.length - 1; i >= 0; i--) {
        const f = fireballs[i];
        if (!f.active) { fireballs.splice(i, 1); continue; }
        f.vy += GRAVITY;
        f.x += f.vx;
        
        let hitWall = false;
        for (const b of curRoom.blocks) {
          if (collides(f, b) && !['P', 'L'].includes(b.type)) {
            if (f.vx > 0) { f.x = b.x - f.w; hitWall = true; }
            else if (f.vx < 0) { f.x = b.x + b.w; hitWall = true; }
          }
        }
        if (hitWall) { f.active = false; continue; }

        f.y += f.vy;
        for (const b of curRoom.blocks) {
          if (collides(f, b) && !['P', 'L'].includes(b.type)) {
            if (f.vy > 0) { f.y = b.y - f.h; f.vy = -6; f.bounces++; }
            else if (f.vy < 0) { f.y = b.y + b.h; f.vy = 0; }
          }
        }

        if (f.bounces > 3 || f.y > 800) f.active = false;

        for (const e of curRoom.enemies) {
          if (!e.dead && collides(f, e)) {
            f.active = false;
            if (e.type === 'boss') {
              e.hp = (e.hp || 0) - 1;
              playSound('stomp');
              if (e.hp <= 0) { e.dead = true; e.dTimer = 60; p.score += 5000; }
            } else {
              e.dead = true; e.dTimer = 30; e.h /= 2; e.y += e.h; p.score += 100; playSound('stomp');
            }
          }
        }
      }

      for (const c of curRoom.coins) {
        if (!c.collected && collides(p, c)) {
          c.collected = true; p.coins++; p.score += 100; playSound('coin');
        }
      }

      for (const b of curRoom.blocks) {
        if (b.type === 'P' && collides(p, b)) {
          state = 'won'; setGameStateStr('won');
        }
      }

      if (p.y > 800) {
        p.state = 'small'; p.h = 38; p.invinc = 0; p.star = 0;
        damagePlayer();
      }

      cam.x = p.x - 400 + p.w / 2;
      if (cam.x < 0) cam.x = 0;
      
      setScore(p.score); setCoins(p.coins);
    };

    const render = () => {
      ctx.fillStyle = '#5c94fc'; ctx.fillRect(0, 0, 800, 600);
      ctx.save(); ctx.translate(-cam.x, -cam.y);

      if (curRoomId === 'main') {
        // Parallax Clouds (slowest)
        for (let i = -2; i < 40; i++) {
          const cx = i * 300 + (cam.x * 0.9); const cy = 100 + (i % 3) * 50;
          ctx.fillStyle = '#fff'; ctx.beginPath();
          ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.arc(cx + 40, cy - 20, 40, 0, Math.PI * 2); ctx.arc(cx + 80, cy, 30, 0, Math.PI * 2); ctx.fill();
        }
        // Parallax Mountains (medium)
        for (let i = -2; i < 40; i++) {
          const mx = i * 500 + (cam.x * 0.6); const my = 15 * TILE;
          ctx.fillStyle = '#008800'; ctx.beginPath();
          ctx.moveTo(mx, my); ctx.lineTo(mx + 250, my - 300); ctx.lineTo(mx + 500, my); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath();
          ctx.moveTo(mx + 166, my - 200); ctx.lineTo(mx + 250, my - 300); ctx.lineTo(mx + 334, my - 200);
          ctx.lineTo(mx + 290, my - 180); ctx.lineTo(mx + 250, my - 220); ctx.lineTo(mx + 210, my - 180); ctx.fill();
        }
      }

      for (const b of curRoom.blocks) {
        if (b.type === 'G') { ctx.fillStyle = '#c84c0c'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h); }
        else if (b.type === 'B') { ctx.fillStyle = '#884400'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h); }
        else if (b.type === '?') {
          ctx.fillStyle = '#fc9838'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.fillStyle = '#000'; ctx.font = 'bold 24px Arial'; ctx.fillText('?', b.x + 12, b.y + 28);
        }
        else if (['T', ']', '|', 'X'].includes(b.type)) {
          ctx.fillStyle = '#00a800'; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.fillStyle = '#58d854'; ctx.fillRect(b.x + 2, b.y + 2, 4, b.h - 4);
        }
        else if (b.type === 'L') { ctx.fillStyle = '#ff4400'; ctx.fillRect(b.x, b.y, b.w, b.h); }
        else if (b.type === 'H') {
          ctx.fillStyle = '#ccc'; ctx.fillRect(b.x + 16, b.y - TILE, 8, b.h + TILE);
          ctx.fillStyle = respawnPos.x === b.x ? '#0f0' : '#f00';
          ctx.beginPath(); ctx.moveTo(b.x + 24, b.y - TILE); ctx.lineTo(b.x + 44, b.y - TILE + 10); ctx.lineTo(b.x + 24, b.y - TILE + 20); ctx.fill();
        }
        else if (b.type === 'P') {
          ctx.fillStyle = '#f8d820'; ctx.fillRect(b.x + 16, b.y, 8, b.h);
          if (b.y === 8 * TILE) {
            ctx.fillStyle = '#00a800'; ctx.beginPath(); ctx.moveTo(b.x + 16, b.y); ctx.lineTo(b.x - 20, b.y + 10); ctx.lineTo(b.x + 16, b.y + 20); ctx.fill();
          }
        }
      }

      for (const c of curRoom.coins) {
        if (!c.collected) {
          ctx.fillStyle = '#fce0a8'; ctx.beginPath(); ctx.arc(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }

      for (const pu of powerups) {
        if (pu.active) {
          ctx.fillStyle = pu.type === 'mushroom' ? '#f00' : pu.type === 'flower' ? '#fa0' : '#ff0';
          ctx.fillRect(pu.x, pu.y, pu.w, pu.h);
        }
      }

      for (const f of fireballs) {
        if (f.active) {
          ctx.fillStyle = '#f40';
          ctx.beginPath();
          ctx.arc(f.x + f.w / 2, f.y + f.h / 2, f.w / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const e of curRoom.enemies) {
        if (!e.dead || (e.dTimer && e.dTimer > 0)) {
          if (e.type === 'boss') {
            ctx.fillStyle = e.chase ? '#f00' : '#800080'; ctx.fillRect(e.x, e.y, e.w, e.h);
            ctx.fillStyle = '#f00'; ctx.fillRect(e.x + 10, e.y + 10, 20, 20); ctx.fillRect(e.x + e.w - 30, e.y + 10, 20, 20);
          } else if (e.type === 'piranha') {
            ctx.fillStyle = '#0a0'; ctx.fillRect(e.x + e.w/2 - 4, e.y + 15, 8, e.h - 15);
            ctx.fillStyle = '#d00'; ctx.beginPath(); ctx.arc(e.x + e.w/2, e.y + 15, 15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(e.x + e.w/2 - 5, e.y + 10, 3, 0, Math.PI * 2); ctx.arc(e.x + e.w/2 + 5, e.y + 10, 3, 0, Math.PI * 2); ctx.fill();
          } else if (e.type === 'koopa' && e.shellState && e.shellState !== 'none') {
            ctx.fillStyle = e.shellState === 'moving' ? '#00f' : '#00a800';
            ctx.fillRect(e.x, e.y + e.h / 2, e.w, e.h / 2);
          } else {
            ctx.fillStyle = e.chase ? '#f00' : e.type === 'koopa' ? '#00a800' : '#a81000';
            ctx.fillRect(e.x, e.y + e.h / 2, e.w, e.h / 2);
            ctx.fillStyle = '#fce0a8'; ctx.fillRect(e.x + 4, e.y, e.w - 8, e.h / 2);
          }
        }
      }

      if (p.invinc % 4 < 2) {
        const starColors = ['#f00', '#f80', '#ff0', '#0f0', '#00f', '#80f'];
        const starColor1 = starColors[Math.floor(frames / 4) % starColors.length];
        const starColor2 = starColors[(Math.floor(frames / 4) + 3) % starColors.length];

        if (character === 'luigi') {
          // Luigi Robot body (taller, green)
          ctx.fillStyle = p.star > 0 ? starColor1 : p.state === 'fire' ? '#eee' : '#0a0';
          ctx.fillRect(p.x + 2, p.y + 5, p.w - 4, p.h - 5);
          
          // Luigi Robot head
          ctx.fillStyle = p.star > 0 ? starColor2 : p.state === 'fire' ? '#f44' : '#080';
          ctx.fillRect(p.x, p.y - 5, p.w, 20);
          
          // Big eyes
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x + (p.facingRight ? 10 : 8), p.y + 5, 5, 0, Math.PI * 2);
          ctx.arc(p.x + (p.facingRight ? 22 : 20), p.y + 5, 5, 0, Math.PI * 2);
          ctx.fill();
          
          // Pupils
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(p.x + (p.facingRight ? 12 : 6), p.y + 5, 2, 0, Math.PI * 2);
          ctx.arc(p.x + (p.facingRight ? 24 : 18), p.y + 5, 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Antenna
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x + p.w / 2, p.y - 5);
          ctx.lineTo(p.x + p.w / 2, p.y - 15);
          ctx.stroke();
          ctx.fillStyle = p.state === 'fire' ? '#f00' : '#ff0';
          ctx.beginPath();
          ctx.arc(p.x + p.w / 2, p.y - 15, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Wheels/Tracks
          ctx.fillStyle = '#333';
          ctx.fillRect(p.x, p.y + p.h - 6, 8, 6);
          ctx.fillRect(p.x + p.w - 8, p.y + p.h - 6, 8, 6);
        } else {
          // Robot body
          ctx.fillStyle = p.star > 0 ? starColor1 : p.state === 'fire' ? '#eee' : '#ccc';
          ctx.fillRect(p.x, p.y + 10, p.w, p.h - 10);
          
          // Robot head
          ctx.fillStyle = p.star > 0 ? starColor2 : p.state === 'fire' ? '#f44' : '#48f';
          ctx.fillRect(p.x - 2, p.y, p.w + 4, 20);
          
          // Big eyes
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x + (p.facingRight ? 10 : 6), p.y + 10, 6, 0, Math.PI * 2);
          ctx.arc(p.x + (p.facingRight ? 24 : 20), p.y + 10, 6, 0, Math.PI * 2);
          ctx.fill();
          
          // Pupils
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(p.x + (p.facingRight ? 12 : 4), p.y + 10, 2, 0, Math.PI * 2);
          ctx.arc(p.x + (p.facingRight ? 26 : 18), p.y + 10, 2, 0, Math.PI * 2);
          ctx.fill();
          
          // Antenna
          ctx.strokeStyle = '#888';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p.x + p.w / 2, p.y);
          ctx.lineTo(p.x + p.w / 2, p.y - 8);
          ctx.stroke();
          ctx.fillStyle = p.state === 'fire' ? '#f00' : '#ff0';
          ctx.beginPath();
          ctx.arc(p.x + p.w / 2, p.y - 8, 3, 0, Math.PI * 2);
          ctx.fill();
          
          // Wheels/Tracks
          ctx.fillStyle = '#333';
          ctx.fillRect(p.x - 2, p.y + p.h - 6, 10, 6);
          ctx.fillRect(p.x + p.w - 8, p.y + p.h - 6, 10, 6);
        }
      }

      ctx.restore();

      if (state === 'won') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.fillText('LEVEL CLEARED!', 400, 300);
      } else if (state === 'paused') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fillRect(0, 0, 800, 600);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', 400, 300);
      }
    };

    loop();
    return () => { cancelAnimationFrame(afId); window.removeEventListener('keydown', (e) => handleKey(e, true)); window.removeEventListener('keyup', (e) => handleKey(e, false)); };
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-gray-900 flex flex-col items-center justify-center font-sans">
      <div className="mb-2 flex gap-4 sm:gap-8 text-white text-xl sm:text-2xl font-bold font-mono">
        <div>SCORE: {score.toString().padStart(6, '0')}</div>
        <div>COINS: x{coins.toString().padStart(2, '0')}</div>
        <div>TIME: {time.toString().padStart(3, '0')}</div>
        <div className="text-blue-400">CHAR: {characterState.toUpperCase()}</div>
      </div>
      <div className="relative rounded-lg overflow-hidden shadow-2xl border-4 border-gray-700 max-w-full">
        <canvas ref={canvasRef} width={800} height={600} className="block bg-black max-w-full h-auto" style={{ maxHeight: '65vh' }} />
      </div>
      <div className="mt-4 text-gray-400 text-center text-sm sm:text-base">
        <p className="mb-2">CONTROLS</p>
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center px-4">
          <span className="bg-gray-800 px-2 py-1 sm:px-3 sm:py-1 rounded border border-gray-700">← → Move</span>
          <span className="bg-gray-800 px-2 py-1 sm:px-3 sm:py-1 rounded border border-gray-700">↑ Jump</span>
          <span className="bg-gray-800 px-2 py-1 sm:px-3 sm:py-1 rounded border border-gray-700">↓ Enter Pipe</span>
          <span className="bg-gray-800 px-2 py-1 sm:px-3 sm:py-1 rounded border border-gray-700">Space Shoot Fireball</span>
          <span className="bg-gray-800 px-2 py-1 sm:px-3 sm:py-1 rounded border border-gray-700">C Switch Character</span>
          <span className="bg-gray-800 px-2 py-1 sm:px-3 sm:py-1 rounded border border-gray-700">P Pause</span>
        </div>
      </div>
      {gameStateStr === 'won' && (
        <button onClick={() => window.location.reload()} className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded shadow-lg transition-colors">
          Play Again
        </button>
      )}
    </div>
  );
}
