// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. Everything is procedural canvas art: a moonlit shore with stars, dunes, water and
// sand, a hooded tidekeeper with her net, glowing tideglass orbs, shells, spiky urchins and
// snapping crabs, plus sparkles, screen shake and a hit flash for juice. Text that holds a
// number is rebuilt only when the number changes, so a frame allocates nothing.

import { CRAB, FIELD, FONT, JAR_GOAL, LIVES, PALETTE, PLAYER } from './config.js';
import { KIND_ORB, KIND_SHELL, KIND_URCHIN } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 72 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function mulberry(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed stars and dune silhouettes, laid out once from a seed so every frame agrees.
const starRandom = mulberry(20261115);
const STARS = [];
for (let i = 0; i < 110; i += 1) {
  STARS.push({ x: starRandom() * FIELD.width, y: starRandom() * 170, r: 0.6 + starRandom() * 1.5, tw: starRandom() * Math.PI * 2 });
}
const DUNE_FAR = [];
const DUNE_NEAR = [];
for (let x = 0; x <= FIELD.width; x += 80) {
  DUNE_FAR.push({ x, y: 118 + starRandom() * 26 });
  DUNE_NEAR.push({ x, y: 138 + starRandom() * 22 });
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const finalLabel = cachedLabel('Score ');
  const comboLabel = cachedLabel('Combo x');
  // Sparkles and splashes: a small fixed pool, recycled, never allocated per frame.
  const particles = [];
  for (let i = 0; i < 160; i += 1) particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#ffffff' });
  let facing = 1;
  let time = 0;

  function spawnParticles(x, y, color, count, speed) {
    let made = 0;
    for (let i = 0; i < particles.length && made < count; i += 1) {
      const p = particles[i];
      if (p.active) continue;
      p.active = true;
      p.x = x;
      p.y = y;
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v - speed * 0.3;
      p.max = 0.5 + Math.random() * 0.5;
      p.life = p.max;
      p.size = 1.5 + Math.random() * 3;
      p.color = color;
      made += 1;
    }
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align) {
    if (!fonts.has(size)) fonts.set(size, `600 ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.fillText(value, x, y);
  }

  function drawSky() {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.waterTop);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.waterTop + 2);
    for (const star of STARS) {
      const alpha = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.8 + star.tw));
      context.globalAlpha = alpha;
      context.fillStyle = PALETTE.star;
      context.beginPath();
      context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    // The moon, low and large, with a soft halo.
    const moonX = 1030;
    const moonY = 78;
    const halo = context.createRadialGradient(moonX, moonY, 20, moonX, moonY, 130);
    halo.addColorStop(0, 'rgba(255, 233, 168, 0.55)');
    halo.addColorStop(1, 'rgba(255, 233, 168, 0)');
    context.fillStyle = halo;
    context.fillRect(moonX - 140, moonY - 140, 280, 280);
    context.fillStyle = PALETTE.moon;
    context.beginPath();
    context.arc(moonX, moonY, 46, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = 'rgba(190, 170, 120, 0.5)';
    context.beginPath();
    context.arc(moonX - 14, moonY - 8, 9, 0, Math.PI * 2);
    context.arc(moonX + 12, moonY + 14, 6, 0, Math.PI * 2);
    context.arc(moonX + 18, moonY - 18, 5, 0, Math.PI * 2);
    context.fill();
    // Far and near dune silhouettes.
    context.fillStyle = PALETTE.duneFar;
    context.beginPath();
    context.moveTo(0, FIELD.waterTop);
    for (const point of DUNE_FAR) context.lineTo(point.x, point.y);
    context.lineTo(FIELD.width, FIELD.waterTop);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.duneNear;
    context.beginPath();
    context.moveTo(0, FIELD.waterTop);
    for (const point of DUNE_NEAR) context.lineTo(point.x, point.y);
    context.lineTo(FIELD.width, FIELD.waterTop);
    context.closePath();
    context.fill();
  }

  function drawWaterAndSand(state) {
    const gradient = context.createLinearGradient(0, FIELD.waterTop, 0, FIELD.sandTop);
    gradient.addColorStop(0, PALETTE.waterTop);
    gradient.addColorStop(1, PALETTE.waterDeep);
    context.fillStyle = gradient;
    context.fillRect(0, FIELD.waterTop, FIELD.width, FIELD.sandTop - FIELD.waterTop);
    // Moonlight shimmering on the water: three drifting bands.
    context.fillStyle = 'rgba(255, 233, 168, 0.10)';
    for (let band = 0; band < 3; band += 1) {
      const y = FIELD.waterTop + 40 + band * 110 + Math.sin(time * 0.7 + band * 2) * 8;
      const width = 260 - band * 50;
      context.fillRect(1030 - width / 2 + Math.sin(time * 0.4 + band) * 20, y, width, 10);
    }
    // Tide line: a pale foam edge that breathes with the tide phase.
    const foamY = FIELD.sandTop - 6 + Math.sin(state.tidePhase) * 5;
    context.fillStyle = 'rgba(232, 244, 255, 0.55)';
    context.fillRect(0, foamY, FIELD.width, 4);
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, FIELD.sandTop, FIELD.width, FIELD.height - FIELD.sandTop);
    context.fillStyle = PALETTE.sandWet;
    context.fillRect(0, FIELD.sandTop, FIELD.width, 10);
    // Pebbles and shells scattered on the sand, fixed by the same seed as the stars.
    context.fillStyle = 'rgba(90, 70, 40, 0.6)';
    for (let i = 0; i < 14; i += 1) {
      const px = STARS[i].x;
      context.beginPath();
      context.arc(px, FIELD.sandTop + 24 + (i % 5) * 16, 3 + (i % 3), 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawItems(state) {
    for (const item of state.items) {
      if (!item.active) continue;
      if (item.kind === KIND_ORB) {
        const glow = context.createRadialGradient(item.x, item.y, 2, item.x, item.y, item.radius * 2.4);
        glow.addColorStop(0, 'rgba(255, 215, 106, 0.7)');
        glow.addColorStop(1, 'rgba(255, 215, 106, 0)');
        context.fillStyle = glow;
        context.beginPath();
        context.arc(item.x, item.y, item.radius * 2.4, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.orb;
        context.beginPath();
        context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.orbCore;
        context.beginPath();
        context.arc(item.x - 3, item.y - 3, item.radius * 0.45, 0, Math.PI * 2);
        context.fill();
      } else if (item.kind === KIND_SHELL) {
        context.fillStyle = PALETTE.shell;
        context.beginPath();
        context.arc(item.x, item.y, item.radius, Math.PI, 0);
        context.closePath();
        context.fill();
        context.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        context.lineWidth = 2;
        for (let rib = -1; rib <= 1; rib += 1) {
          context.beginPath();
          context.moveTo(item.x, item.y);
          context.lineTo(item.x + rib * item.radius * 0.7, item.y - item.radius);
          context.stroke();
        }
      } else if (item.kind === KIND_URCHIN) {
        context.fillStyle = PALETTE.urchin;
        for (let spike = 0; spike < 10; spike += 1) {
          const angle = (spike / 10) * Math.PI * 2 + time * 0.6;
          context.beginPath();
          context.moveTo(item.x + Math.cos(angle) * item.radius * 0.5, item.y + Math.sin(angle) * item.radius * 0.5);
          context.lineTo(item.x + Math.cos(angle) * (item.radius + 9), item.y + Math.sin(angle) * (item.radius + 9));
          context.lineTo(item.x + Math.cos(angle + 0.3) * item.radius * 0.5, item.y + Math.sin(angle + 0.3) * item.radius * 0.5);
          context.closePath();
          context.fill();
        }
        context.beginPath();
        context.arc(item.x, item.y, item.radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = 'rgba(255, 255, 255, 0.35)';
        context.beginPath();
        context.arc(item.x - 4, item.y - 4, item.radius * 0.3, 0, Math.PI * 2);
        context.fill();
      }
    }
    for (const crab of state.crabs) {
      if (!crab.active) continue;
      const x = crab.x;
      const y = crab.y;
      context.fillStyle = PALETTE.crab;
      context.beginPath();
      context.ellipse(x, y, CRAB.width / 2, CRAB.height / 2, 0, 0, Math.PI * 2);
      context.fill();
      // Claws, snapping open and shut.
      const snap = 0.4 + 0.4 * Math.sin(time * 6 + x * 0.01);
      for (const side of [-1, 1]) {
        const clawX = x + side * (CRAB.width / 2 + 4);
        context.beginPath();
        context.arc(clawX, y - 8, 8, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffd9d0';
        context.beginPath();
        context.arc(clawX, y - 8 - snap * 6, 3, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.crab;
      }
      // Legs.
      context.strokeStyle = PALETTE.crab;
      context.lineWidth = 3;
      for (let leg = -1; leg <= 1; leg += 1) {
        context.beginPath();
        context.moveTo(x + leg * 12, y + 8);
        context.lineTo(x + leg * 16, y + 20);
        context.stroke();
      }
      // Eyes on stalks.
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(x - 8, y - CRAB.height / 2 - 4, 4, 0, Math.PI * 2);
      context.arc(x + 8, y - CRAB.height / 2 - 4, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#222';
      context.beginPath();
      context.arc(x - 8, y - CRAB.height / 2 - 4, 2, 0, Math.PI * 2);
      context.arc(x + 8, y - CRAB.height / 2 - 4, 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;
    const x = player.x;
    const y = player.y;
    // Ripples where she wades.
    context.strokeStyle = 'rgba(232, 244, 255, 0.35)';
    context.lineWidth = 2;
    context.beginPath();
    context.ellipse(x, y + PLAYER.radius + 6, 34 + Math.sin(time * 2) * 4, 8, 0, 0, Math.PI * 2);
    context.stroke();
    // The net, held out to the side she faces: a hoop and a mesh.
    const netX = x + facing * (PLAYER.radius + 26);
    context.strokeStyle = '#8a6f42';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(x + facing * 10, y);
    context.lineTo(netX - facing * PLAYER.netRadius * 0.4, y - 6);
    context.stroke();
    context.strokeStyle = PALETTE.net;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(netX, y - 6, PLAYER.netRadius * 0.55, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = 'rgba(232, 244, 255, 0.5)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(netX - 12, y - 20);
    context.lineTo(netX + 12, y + 8);
    context.moveTo(netX + 12, y - 20);
    context.lineTo(netX - 12, y + 8);
    context.stroke();
    // Hooded cloak: a rounded body, a hood, a pale face.
    context.fillStyle = PALETTE.playerDark;
    context.beginPath();
    context.moveTo(x - 22, y + 26);
    context.quadraticCurveTo(x - 26, y - 6, x, y - 20);
    context.quadraticCurveTo(x + 26, y - 6, x + 22, y + 26);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x, y - 22, 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#123b30';
    context.beginPath();
    context.arc(x + facing * 3, y - 21, 8, 0, Math.PI * 2);
    context.fill();
    // A small tideglass orb glowing at her belt: the jar she is filling.
    context.fillStyle = PALETTE.orb;
    context.beginPath();
    context.arc(x - facing * 14, y + 8, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawParticles(dt) {
    for (const p of particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      context.globalAlpha = p.life / p.max;
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawHud(state, best) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 28, PALETTE.text, 'left');
    // The Moon Jar: a jar outline filling with gold as orbs are caught.
    const jarX = FIELD.width / 2 - 110;
    const jarY = 16;
    const jarW = 220;
    const jarH = 26;
    context.fillStyle = 'rgba(16, 23, 54, 0.8)';
    context.fillRect(jarX, jarY, jarW, jarH);
    context.fillStyle = PALETTE.orb;
    const fillWidth = (jarW - 6) * (state.caught / JAR_GOAL);
    context.fillRect(jarX + 3, jarY + 3, fillWidth, jarH - 6);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(jarX, jarY, jarW, jarH);
    // The count sits on the fill and on the empty bar at once, so it is drawn twice:
    // dark where the gold fill is behind it, light where the dark bar is.
    const jarText = `${state.caught}/${JAR_GOAL}`;
    context.save();
    context.beginPath();
    context.rect(jarX + 3, jarY, fillWidth, jarH);
    context.clip();
    text(jarText, FIELD.width / 2, jarY + 3, 20, '#1a2347', 'center');
    context.restore();
    context.save();
    context.beginPath();
    context.rect(jarX + 3 + fillWidth, jarY, jarW - 6 - fillWidth, jarH);
    context.clip();
    text(jarText, FIELD.width / 2, jarY + 3, 20, PALETTE.text, 'center');
    context.restore();
    // Lives as hearts, top right.
    for (let life = 0; life < LIVES; life += 1) {
      const hx = FIELD.width - 24 - (LIVES - life) * 34;
      const hy = 30;
      context.fillStyle = life < state.lives ? '#ff6b8a' : 'rgba(255, 255, 255, 0.18)';
      context.beginPath();
      context.arc(hx - 6, hy, 7, 0, Math.PI * 2);
      context.arc(hx + 6, hy, 7, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(hx - 12, hy + 2);
      context.lineTo(hx, hy + 14);
      context.lineTo(hx + 12, hy + 2);
      context.closePath();
      context.fill();
    }
    text(`Level ${state.level}`, 24, 52, 22, PALETTE.muted, 'left');
    text(bestLabel(best), FIELD.width - 24, 52, 22, PALETTE.muted, 'right');
    if (state.combo >= 2) {
      text(comboLabel(state.combo), FIELD.width / 2, 56, 26, PALETTE.orb, 'center');
    }
  }

  function drawPanel(title, lines, prompt) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7, 11, 29, 0.55)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 76, 52, PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + PANEL.top + index * PANEL.line, 22, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 38, 24, PALETTE.orb, 'center');
  }

  const TITLE_LINES = [
    'Catch the falling tideglass orbs in your net.',
    'Fill the Moon Jar — 30 orbs — before the moon sets.',
    'Dodge the spiky urchins and the snapping crabs.',
    'Move with ← → ↑ ↓ or WASD, or hold the mouse. M mutes.',
    '',
  ];
  const PAUSED_LINES = ['The tide will wait for you.'];
  const WIN_LINES = ['', '', ''];
  const OVER_LINES = ['', '', ''];

  /**
   * Paint one frame. `events` are the world's bit flags from this frame's steps (0 when
   * the caller has none), used to burst sparkles where things were caught or lost.
   */
  function draw(state, screen, best, events, dt, moveX) {
    time += dt;
    // The hit flash and shake fade here, every painted frame, so they also fade on the
    // win and game-over screens, where the world no longer steps.
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.5);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
    if (moveX !== 0) facing = moveX > 0 ? 1 : -1;
    if (events !== 0) {
      // Bit 1 is EVENT_CATCH, 2 is EVENT_SHELL, 4 is EVENT_HIT (world.js).
      if (events & 1) spawnParticles(state.player.x, state.player.y - 10, PALETTE.orb, 22, 220);
      if (events & 2) spawnParticles(state.player.x, state.player.y - 10, PALETTE.shell, 18, 200);
      if (events & 4) spawnParticles(state.player.x, state.player.y, '#ff6b6b', 26, 260);
    }
    const shakeX = state.shake > 0 ? Math.sin(time * 47) * state.shake * 9 : 0;
    const shakeY = state.shake > 0 ? Math.cos(time * 39) * state.shake * 7 : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawSky();
    drawWaterAndSand(state);
    drawItems(state);
    drawPlayer(state);
    drawParticles(dt);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[4] = bestLabel(best);
      drawPanel('Tideglass', TITLE_LINES, 'Press Space or click to wade in');
      return;
    }
    drawHud(state, best);
    if (screen === SCREEN_PAUSED) drawPanel('Paused', PAUSED_LINES, 'Press P to resume');
    else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = `Best combo x${state.bestCombo}  ·  ${bestLabel(best)}`;
      WIN_LINES[2] = 'The Moon Jar is full — the tide glows gold.';
      drawPanel('The Jar is Full!', WIN_LINES, 'Press Space or click to play again');
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `Caught ${state.caught} of ${JAR_GOAL} orbs  ·  ${bestLabel(best)}`;
      OVER_LINES[2] = 'The moon set before the jar was full.';
      drawPanel('The Moon Has Set', OVER_LINES, 'Press Space or click to try again');
    }
    if (state.flash > 0) {
      context.fillStyle = `rgba(255, 60, 60, ${state.flash * 0.22})`;
      context.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Convert a CSS-pixel pointer position to field coordinates. */
    toField(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const cssX = clientX - rect.left;
      const cssY = clientY - rect.top;
      return { x: (cssX * view.ratio - view.x) / view.scale, y: (cssY * view.ratio - view.y) / view.scale };
    },
  };
}
