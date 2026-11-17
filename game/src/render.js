// Painting only: the world's state and the current screen in, pixels out. The
// 1280x720 field is scaled to fit the window and centred, the margin filled with
// the backdrop colour. Everything is procedural canvas art, painted in layers —
// sky, sea, things, keeper, spray, then the interface — so each layer can be read
// on its own: a moonlit shore with stars, dunes, water and sand, a hooded
// tidekeeper with her net, glowing tideglass orbs, golden orbs, Moon Pearls,
// shells, spiky urchins and snapping crabs, plus the spray and sparks the world
// raises when something is caught or lost, screen shake and a hit flash for juice.
// The sea deepens as the level rises, and a thin gold bar under the Moon Jar
// shows how hot the combo is running. Text that holds a number is rebuilt only
// when the number changes, so a frame allocates nothing.

import { CRAB, FIELD, FONT, GOLDEN, JAR_GOAL, LIVES, PALETTE, PLAYER, SHELL_BONUS, SURGE } from './config.js';
import { KIND_GOLDEN, KIND_ORB, KIND_PEARL, KIND_SHELL, KIND_URCHIN } from './world.js';
import { drawParticles } from './particles.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_WIN = 'win';
export const SCREEN_OVER = 'over';

/** The panel's width; its height grows with its lines: room for the title, the lines and the prompt. */
const PANEL = { width: 640, top: 150, line: 32, bottom: 72 };

/** The combo bar: how many catches in a row it takes to fill it. */
const COMBO_FULL = 10;

/** How much darker the sea gets at the deepest level, on top of its gradient. */
const TIDE_DARKEN = 0.22;

function labelCache(prefix) {
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
const decorRandom = mulberry(20261115);
const STARS = [];
for (let i = 0; i < 110; i += 1) {
  STARS.push({ x: decorRandom() * FIELD.width, y: decorRandom() * 170, r: 0.6 + decorRandom() * 1.5, tw: decorRandom() * Math.PI * 2 });
}
const DUNE_FAR = [];
const DUNE_NEAR = [];
for (let x = 0; x <= FIELD.width; x += 80) {
  DUNE_FAR.push({ x, y: 118 + decorRandom() * 26 });
  DUNE_NEAR.push({ x, y: 138 + decorRandom() * 22 });
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const scoreLabel = labelCache('Score ');
  const bestLabel = labelCache('Best ');
  const finalLabel = labelCache('Score ');
  const comboLabel = labelCache('Combo x');
  let facing = 1;
  let time = 0;

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

  /** A soft round glow centred on (x, y), fading to nothing at `reach`. */
  function glow(x, y, reach, rgba) {
    const g = context.createRadialGradient(x, y, 2, x, y, reach);
    g.addColorStop(0, rgba);
    g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
    context.fillStyle = g;
    context.beginPath();
    context.arc(x, y, reach, 0, Math.PI * 2);
    context.fill();
  }

  /** A plain filled disc. */
  function disc(x, y, radius, color) {
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  /** A ridge line: a row of points joined and closed down to the waterline. */
  function ridge(points, color) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, FIELD.waterTop);
    for (const point of points) context.lineTo(point.x, point.y);
    context.lineTo(FIELD.width, FIELD.waterTop);
    context.closePath();
    context.fill();
  }

  /** Layer 1 — the sky: gradient, twinkling stars, the low moon, and two dune ridges. */
  function paintSky() {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.waterTop);
    gradient.addColorStop(0, PALETTE.skyTop);
    gradient.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.waterTop + 2);
    for (const star of STARS) {
      const alpha = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.8 + star.tw));
      context.globalAlpha = alpha;
      disc(star.x, star.y, star.r, PALETTE.star);
    }
    context.globalAlpha = 1;
    // The moon, low and large, with a soft halo and three craters.
    const moonX = 1030;
    const moonY = 78;
    glow(moonX, moonY, 130, 'rgba(255, 233, 168, 0.55)');
    disc(moonX, moonY, 46, PALETTE.moon);
    context.fillStyle = 'rgba(190, 170, 120, 0.5)';
    context.beginPath();
    context.arc(moonX - 14, moonY - 8, 9, 0, Math.PI * 2);
    context.arc(moonX + 12, moonY + 14, 6, 0, Math.PI * 2);
    context.arc(moonX + 18, moonY - 18, 5, 0, Math.PI * 2);
    context.fill();
    ridge(DUNE_FAR, PALETTE.duneFar);
    ridge(DUNE_NEAR, PALETTE.duneNear);
  }

  /** Layer 2 — the sea and the sand. The water deepens as the level rises: the
   *  same gradient, darkened a little more each level, so a late game looks later. */
  function paintSea(state) {
    const gradient = context.createLinearGradient(0, FIELD.waterTop, 0, FIELD.sandTop);
    gradient.addColorStop(0, PALETTE.waterTop);
    gradient.addColorStop(1, PALETTE.waterDeep);
    context.fillStyle = gradient;
    context.fillRect(0, FIELD.waterTop, FIELD.width, FIELD.sandTop - FIELD.waterTop);
    const deepen = TIDE_DARKEN * ((state.level - 1) / 7);
    if (deepen > 0) {
      context.fillStyle = `rgba(4, 8, 32, ${deepen})`;
      context.fillRect(0, FIELD.waterTop, FIELD.width, FIELD.sandTop - FIELD.waterTop);
    }
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

  /** A plain tideglass orb: a warm glow, a gold disc, a bright core. */
  function paintOrb(item) {
    glow(item.x, item.y, item.radius * 2.4, 'rgba(255, 215, 106, 0.7)');
    disc(item.x, item.y, item.radius, PALETTE.orb);
    disc(item.x - 3, item.y - 3, item.radius * 0.45, PALETTE.orbCore);
  }

  /** A golden tideglass orb: bigger, brighter, ringed with four star rays that
   *  slowly turn, so it reads as the prize it is from across the field. */
  function paintGolden(item) {
    const pulse = 1 + 0.12 * Math.sin(time * 5 + item.phase);
    glow(item.x, item.y, item.radius * 3.1 * pulse, 'rgba(255, 181, 46, 0.85)');
    // Four star rays, turning slowly.
    context.strokeStyle = PALETTE.goldenRay;
    context.lineWidth = 3;
    for (let ray = 0; ray < 4; ray += 1) {
      const angle = (ray / 4) * Math.PI * 2 + time * 0.9;
      context.beginPath();
      context.moveTo(item.x + Math.cos(angle) * (item.radius + 2), item.y + Math.sin(angle) * (item.radius + 2));
      context.lineTo(item.x + Math.cos(angle) * (item.radius + 13), item.y + Math.sin(angle) * (item.radius + 13));
      context.stroke();
    }
    disc(item.x, item.y, item.radius, PALETTE.golden);
    disc(item.x - 4, item.y - 4, item.radius * 0.45, PALETTE.goldenCore);
    // The value, small and gold, so a player can tell at a glance what it is worth.
    text(`+${GOLDEN.points}`, item.x, item.y + item.radius + 18, 15, PALETTE.goldenCore, 'center');
  }

  /** A Moon Pearl: a pale pearl with a breathing halo ring. */
  function paintPearl(item) {
    glow(item.x, item.y, item.radius * 2.6, 'rgba(159, 216, 255, 0.6)');
    context.strokeStyle = PALETTE.pearlRing;
    context.lineWidth = 2;
    context.beginPath();
    context.arc(item.x, item.y, item.radius + 6 + Math.sin(time * 3 + item.phase) * 2, 0, Math.PI * 2);
    context.stroke();
    disc(item.x, item.y, item.radius, PALETTE.pearl);
    disc(item.x - 3, item.y - 4, item.radius * 0.4, PALETTE.pearlCore);
  }

  /** A shell: a pink half-disc with three white ribs. */
  function paintShell(item) {
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
  }

  /** An urchin: a dark body ringed with ten spikes that slowly turn. */
  function paintUrchin(item) {
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
    disc(item.x, item.y, item.radius, PALETTE.urchin);
    context.fillStyle = 'rgba(255, 255, 255, 0.35)';
    context.beginPath();
    context.arc(item.x - 4, item.y - 4, item.radius * 0.3, 0, Math.PI * 2);
    context.fill();
  }

  /** One crab: an oval body, snapping claws, three legs a side, eyes on stalks. */
  function paintCrab(crab) {
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
      context.fillStyle = PALETTE.crab;
      context.beginPath();
      context.arc(clawX, y - 8, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffd9d0';
      context.beginPath();
      context.arc(clawX, y - 8 - snap * 6, 3, 0, Math.PI * 2);
      context.fill();
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

  /** Which painter draws which kind of falling thing. */
  const ITEM_PAINT = {
    [KIND_ORB]: paintOrb,
    [KIND_GOLDEN]: paintGolden,
    [KIND_PEARL]: paintPearl,
    [KIND_SHELL]: paintShell,
    [KIND_URCHIN]: paintUrchin,
  };

  /** Layer 3 — everything that falls, and everything that scuttles. */
  function paintItems(state) {
    for (const item of state.items) {
      if (!item.active) continue;
      const paint = ITEM_PAINT[item.kind];
      if (paint) paint(item);
    }
    for (const crab of state.crabs) {
      if (crab.active) paintCrab(crab);
    }
  }

  /** Layer 4 — Mara: ripples where she wades, her net held out to the side she
   *  faces, a hooded cloak, a pale face, a tideglass orb glowing at her belt, and
   *  a pale ring while she holds a Moon Pearl's shield. She blinks out on alternate
   *  frames while invulnerable, so the player can see the grace period. */
  function paintPlayer(state) {
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
    disc(x - facing * 14, y + 8, 5, PALETTE.orb);
    // A held Moon Pearl shows as a pale ring around her, so the shield is visible
    // before it is needed — and its shattering is visible when it is spent.
    if (state.shield) {
      context.strokeStyle = PALETTE.shield;
      context.lineWidth = 3;
      context.globalAlpha = 0.65 + 0.35 * Math.sin(time * 4);
      context.beginPath();
      context.arc(x, y, PLAYER.radius + 14, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = 1;
    }
  }

  /** Layer 5 — the spray and sparks the world raised. */
  function paintParticles(state) {
    if (state.particles) drawParticles(context, state.particles);
  }

  /** The floating "+points" note a catch leaves behind, rising and fading. */
  function paintPopup(state) {
    const popup = state.popup;
    if (popup.life <= 0 || popup.text === '') return;
    const rise = (1 - popup.life) * 34;
    context.globalAlpha = Math.min(1, popup.life * 1.4);
    context.textBaseline = 'alphabetic';
    text(popup.text, popup.x, popup.y - rise, 26, PALETTE.text, 'center');
    context.globalAlpha = 1;
  }

  /** The tide-surge banner, shown while a surge shower is falling. */
  function paintSurgeBanner(state) {
    if (state.surge <= 0) return;
    context.globalAlpha = Math.min(1, state.surge);
    context.textBaseline = 'alphabetic';
    text('Tide surge!', FIELD.width / 2, 108, 30, PALETTE.goldenCore, 'center');
    context.globalAlpha = 1;
  }

  /** The surge countdown, shown in the last ten seconds before a shower, so
   *  the player can drift into position instead of being caught by surprise.
   *  It stays hidden once the jar is nearly full, when surges stop coming. */
  function paintSurgeCountdown(state) {
    if (state.surgeTimer >= 10 || state.surgeTimer <= 0) return;
    if (state.caught >= JAR_GOAL - SURGE.stopWhenCaughtLeft) return;
    context.globalAlpha = 0.9;
    context.textBaseline = 'alphabetic';
    text(`Surge in ${Math.ceil(state.surgeTimer)}s`, FIELD.width / 2, 200, 22, PALETTE.muted, 'center');
    context.globalAlpha = 1;
  }

  /** The level banner, shown for a couple of seconds after the level rises, so
   *  a player who is watching the orbs still notices the tide quickening. */
  function paintLevelBanner(state) {
    if (state.levelBanner <= 0) return;
    context.globalAlpha = Math.min(1, state.levelBanner);
    context.textBaseline = 'alphabetic';
    text(`Level ${state.level} — the tide quickens`, FIELD.width / 2, 170, 28, PALETTE.text, 'center');
    context.globalAlpha = 1;
  }

  /** The first-run hint, a small line near the bottom of the water, shown while
   *  a lesson is due. It sits above the sand so it never covers the keeper. */
  function paintHint(state) {
    if (state.hint === '') return;
    context.globalAlpha = 0.92;
    context.textBaseline = 'alphabetic';
    text(state.hint, FIELD.width / 2, FIELD.sandTop - 28, 22, PALETTE.text, 'center');
    context.globalAlpha = 1;
  }

  /** A red vignette at the edges while only one life is left: a quiet warning
   *  that the next sting ends the game, pulsing gently so it cannot be missed. */
  function paintDanger(state) {
    if (state.lives !== 1) return;
    const pulse = 0.10 + 0.06 * Math.sin(time * 3);
    const edge = context.createRadialGradient(
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.32,
      FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.72,
    );
    edge.addColorStop(0, 'rgba(255, 60, 60, 0)');
    edge.addColorStop(1, `rgba(255, 60, 60, ${pulse})`);
    context.fillStyle = edge;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  /** The Golden Tide banner, shown while orbs are worth double, with the
   *  seconds left so the player knows how long the rush will last. */
  function paintRushBanner(state) {
    if (state.rush <= 0) return;
    context.globalAlpha = Math.min(1, state.rush);
    context.textBaseline = 'alphabetic';
    text(`Golden Tide! Orbs x2 — ${Math.ceil(state.rush)}s`, FIELD.width / 2, 140, 28, PALETTE.goldenCore, 'center');
    context.globalAlpha = 1;
  }

  /** Layer 6 — the interface: score, the Moon Jar, lives and the shield pip,
   *  level and best, and — while a combo is running — a thin gold bar under the
   *  jar that fills as the combo grows, with the combo count beneath it. Three
   *  small pink shells under the level show how close the Golden Tide is. */
  function paintHud(state, best) {
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
    // The combo bar: a thin gold strip under the jar, full at ten catches in a row.
    if (state.combo >= 2) {
      const barY = jarY + jarH + 4;
      const barH = 5;
      context.fillStyle = 'rgba(16, 23, 54, 0.8)';
      context.fillRect(jarX, barY, jarW, barH);
      context.fillStyle = PALETTE.orb;
      context.fillRect(jarX, barY, jarW * Math.min(1, state.combo / COMBO_FULL), barH);
    }
    // Lives as hearts, top right — and a pale pearl pip beside them while a shield
    // is held, so the player always knows the shield is there.
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
    if (state.shield) {
      const px = FIELD.width - 24 - LIVES * 34 - 22;
      context.fillStyle = PALETTE.pearl;
      context.beginPath();
      context.arc(px, 30, 9, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = PALETTE.pearlRing;
      context.lineWidth = 2;
      context.beginPath();
      context.arc(px, 30, 13, 0, Math.PI * 2);
      context.stroke();
    }
    text(`Level ${state.level}`, 24, 52, 22, PALETTE.muted, 'left');
    text(bestLabel(best), FIELD.width - 24, 52, 22, PALETTE.muted, 'right');
    // Shells toward the Golden Tide: three small pink half-discs under the
    // level, filled as shells are caught, empty until then.
    for (let s = 0; s < SHELL_BONUS.shellsNeeded; s += 1) {
      const sx = 32 + s * 18;
      const sy = 88;
      context.fillStyle = s < state.shells ? PALETTE.shell : 'rgba(255, 255, 255, 0.18)';
      context.beginPath();
      context.arc(sx, sy, 6, Math.PI, 0);
      context.closePath();
      context.fill();
    }
    if (state.combo >= 2) {
      text(comboLabel(state.combo), FIELD.width / 2, 56, 26, PALETTE.orb, 'center');
    }
  }

  /** A centred overlay panel: a title, a few lines, and a prompt at the bottom. */
  function paintPanel(title, lines, prompt) {
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
    'Golden orbs are worth 50, but never fill the jar.',
    'A Moon Pearl shields one sting. Surges shower orbs.',
    'Three shells open the Golden Tide: orbs worth double.',
    'Dodge the spiky urchins and the snapping crabs.',
    'Move with ← → ↑ ↓ or WASD, or hold the mouse. M mutes.',
    '',
  ];
  const PAUSED_LINES = ['', '', '', ''];
  const WIN_LINES = ['', '', '', '', ''];
  const OVER_LINES = ['', '', '', ''];

  /**
   * Paint one frame, layer by layer. `events` is accepted for the caller's
   * convenience and not read here: the spray and sparks are raised by the world
   * itself, at the place each thing happened, and painted from the state.
   */
  function draw(state, screen, best, events, dt, moveX) {
    time += dt;
    // The hit flash and shake fade here, every painted frame, so they also fade on the
    // win and game-over screens, where the world no longer steps.
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.5);
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
    if (moveX !== 0) facing = moveX > 0 ? 1 : -1;
    const shakeX = state.shake > 0 ? Math.sin(time * 47) * state.shake * 9 : 0;
    const shakeY = state.shake > 0 ? Math.cos(time * 39) * state.shake * 7 : 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    paintSky();
    paintSea(state);
    paintItems(state);
    paintPlayer(state);
    paintParticles(state);
    paintPopup(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[7] = bestLabel(best);
      paintPanel('Tideglass', TITLE_LINES, 'Press Space or click to wade in');
      return;
    }
    paintHud(state, best);
    paintSurgeBanner(state);
    paintSurgeCountdown(state);
    paintRushBanner(state);
    paintLevelBanner(state);
    paintDanger(state);
    if (screen === SCREEN_PLAY) paintHint(state);
    if (screen === SCREEN_PAUSED) {
      // The pause screen shows where the run stands, so a player returning to
      // it can see the score, the jar, the level and the best combo at a glance.
      PAUSED_LINES[0] = finalLabel(state.score);
      PAUSED_LINES[1] = `Caught ${state.caught} of ${JAR_GOAL} orbs  ·  Level ${state.level}`;
      PAUSED_LINES[2] = `Best combo x${state.bestCombo}  ·  ${bestLabel(best)}`;
      PAUSED_LINES[3] = 'The tide will wait for you.';
      paintPanel('Paused', PAUSED_LINES, 'Press P to resume');
    } else if (screen === SCREEN_WIN) {
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = `Best combo x${state.bestCombo}  ·  ${bestLabel(best)}`;
      WIN_LINES[2] = `Golden orbs ${state.goldenCaught}  ·  Pearls ${state.pearlCaught}`;
      WIN_LINES[3] = `Orbs ${state.scoreOrbs} · Golden ${state.scoreGolden} · Pickups ${state.scorePickups} · Bonus ${state.scoreBonus}`;
      WIN_LINES[4] = 'The Moon Jar is full — the tide glows gold.';
      paintPanel('The Jar is Full!', WIN_LINES, 'Press Space or click to play again');
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = `Caught ${state.caught} of ${JAR_GOAL} orbs  ·  ${bestLabel(best)}`;
      OVER_LINES[2] = `Golden orbs ${state.goldenCaught}  ·  Pearls ${state.pearlCaught}`;
      OVER_LINES[3] = 'The moon set before the jar was full.';
      paintPanel('The Moon Has Set', OVER_LINES, 'Press Space or click to try again');
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
