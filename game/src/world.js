// The game's rules and state, with no drawing and no browser in it: Mara the tidekeeper,
// the pool of falling orbs, shells, urchins and scuttling crabs, the tide's sideways drift,
// the Moon Jar, score, combo, lives and level. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns.
//
// Three decisions shape a run, not one. A golden tideglass orb falls fast and is worth
// 50 points, but it does not fill the Moon Jar — chasing it trades score against the win.
// A Moon Pearl shields exactly one sting or snap, so it is worth grabbing before a risky
// catch. And every 45 seconds a tide surge showers five orbs at once, a burst of catches
// for a player in position. All three are rare on purpose: each one met is a small
// choice, and the jar still takes 30 plain orbs to fill.

import { CRAB, FIELD, GOLDEN, HINTS, JAR_GOAL, LEVEL, LIVES, ORB, PALETTE, PEARL, PLAYER, POOL_SIZE, SHELL, SHELL_BONUS, SURGE, TIDE, URCHIN } from './config.js';
import { createParticles, spawnCatch, spawnGolden, spawnHit, spawnPearl, spawnSurge as spraySurge, stepParticles } from './particles.js';

export const KIND_ORB = 0;
export const KIND_SHELL = 1;
export const KIND_URCHIN = 2;
export const KIND_GOLDEN = 3;
export const KIND_PEARL = 4;

export const EVENT_CATCH = 1;
export const EVENT_SHELL = 2;
export const EVENT_HIT = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_LEVEL = 32;
export const EVENT_SHIELD = 64;
export const EVENT_SURGE = 128;
export const EVENT_GOLDEN = 256;
export const EVENT_PEARL = 512;
export const EVENT_BONUS = 1024;

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const player = { x: FIELD.width / 2, y: 480, radius: PLAYER.radius, invulnerable: 0 };
  const items = [];
  for (let index = 0; index < POOL_SIZE; index += 1) {
    items.push({ active: false, kind: KIND_ORB, x: 0, y: 0, radius: 0, speed: 0, wobble: 0, phase: 0 });
  }
  // Crabs live apart from the falling pool: at most two scuttle the sand at once.
  const crabs = [
    { active: false, x: 0, y: FIELD.sandTop + 38, direction: 1, speed: 0 },
    { active: false, x: 0, y: FIELD.sandTop + 38, direction: -1, speed: 0 },
  ];
  const state = {
    player,
    items,
    crabs,
    score: 0,
    caught: 0,
    combo: 0,
    bestCombo: 0,
    lives: LIVES,
    level: 1,
    elapsed: 0,
    tidePhase: 0,
    orbTimer: 0,
    shellTimer: 0,
    urchinTimer: 0,
    crabTimer: 0,
    goldenTimer: 0,
    pearlTimer: 0,
    surgeTimer: 0,
    shield: false,
    goldenCaught: 0,
    pearlCaught: 0,
    surge: 0,
    // The shell bonus: shells collected toward the Golden Tide, seconds of
    // double-points tide left, and bonus points earned from it so far.
    shells: 0,
    rush: 0,
    shellBonus: 0,
    // Where the score came from, so the win panel can show the breakdown:
    // plain orbs, golden orbs, shells and pearls, and the shell bonus itself.
    scoreOrbs: 0,
    scoreGolden: 0,
    scorePickups: 0,
    scoreBonus: 0,
    // Seconds the level-up banner stays on screen after a level rises.
    levelBanner: 0,
    // The first-run hint showing right now, or '' once the lessons are done.
    hint: '',
    popup: { x: 0, y: 0, text: '', life: 0 },
    shake: 0,
    flash: 0,
    // The spray, sparks and bubbles: pure feedback, kept in the state so the
    // renderer can paint them, and never allowed to change a score or a life.
    particles: createParticles(),
  };

  function reset() {
    player.x = FIELD.width / 2;
    player.y = 480;
    player.invulnerable = 0;
    for (const item of items) item.active = false;
    for (const crab of crabs) crab.active = false;
    state.score = 0;
    state.caught = 0;
    state.combo = 0;
    state.bestCombo = 0;
    state.lives = LIVES;
    state.level = 1;
    state.elapsed = 0;
    state.tidePhase = 0;
    state.orbTimer = ORB.interval;
    state.shellTimer = SHELL.interval;
    state.urchinTimer = URCHIN.interval;
    state.crabTimer = CRAB.interval;
    state.goldenTimer = GOLDEN.interval;
    state.pearlTimer = PEARL.interval;
    state.surgeTimer = SURGE.interval;
    state.shield = false;
    state.goldenCaught = 0;
    state.pearlCaught = 0;
    state.surge = 0;
    state.shells = 0;
    state.rush = 0;
    state.shellBonus = 0;
    state.scoreOrbs = 0;
    state.scoreGolden = 0;
    state.scorePickups = 0;
    state.scoreBonus = 0;
    state.levelBanner = 0;
    state.hint = '';
    state.popup.text = '';
    state.popup.life = 0;
    state.shake = 0;
    state.flash = 0;
    // Empty the particle list in place: no fresh object, so a reset never allocates.
    state.particles.list.length = 0;
  }

  function freeItem() {
    for (let index = 0; index < items.length; index += 1) if (!items[index].active) return items[index];
    return null;
  }

  function hasActiveKind(kind) {
    for (const item of items) if (item.active && item.kind === kind) return true;
    return false;
  }

  function spawn(kind, radius, speed) {
    const item = freeItem();
    if (item === null) return;
    item.active = true;
    item.kind = kind;
    item.radius = radius;
    item.x = 30 + random() * (FIELD.width - 60);
    item.y = -radius - 10;
    item.speed = speed;
    item.wobble = 12 + random() * 26;
    item.phase = random() * Math.PI * 2;
  }

  function spawnOrb() {
    spawn(KIND_ORB, ORB.radius, ORB.fall + ORB.fallPerLevel * (state.level - 1) + random() * ORB.fallJitter);
  }

  function spawnShell() {
    spawn(KIND_SHELL, SHELL.radius, SHELL.fall);
  }

  function spawnUrchin() {
    spawn(KIND_URCHIN, URCHIN.radius, URCHIN.fall + URCHIN.fallPerLevel * (state.level - 1));
  }

  /** A golden orb: one at a time, fast, and worth 50 — but it never fills the jar. */
  function spawnGolden() {
    if (hasActiveKind(KIND_GOLDEN)) return;
    spawn(KIND_GOLDEN, GOLDEN.radius, GOLDEN.fall + random() * GOLDEN.fallJitter);
  }

  /** A Moon Pearl: one at a time, slow, and worth a shield while none is held. */
  function spawnPearl() {
    if (hasActiveKind(KIND_PEARL)) return;
    spawn(KIND_PEARL, PEARL.radius, PEARL.fall);
  }

  function spawnCrab() {
    for (const crab of crabs) {
      if (crab.active) continue;
      crab.active = true;
      crab.direction = random() < 0.5 ? 1 : -1;
      crab.x = crab.direction === 1 ? -CRAB.width : FIELD.width + CRAB.width;
      crab.speed = CRAB.speed + CRAB.speedPerLevel * (state.level - 1);
      return;
    }
  }

  /** A tide surge: a shower of plain orbs across the field, all at once. */
  function spawnSurge() {
    if (state.caught >= JAR_GOAL - SURGE.stopWhenCaughtLeft) return;
    for (let count = 0; count < SURGE.count; count += 1) spawnOrb();
    state.surge = 2.5;
  }

  function orbInterval() {
    return Math.max(ORB.minInterval, ORB.interval * ORB.intervalScale ** (state.level - 1));
  }

  function urchinInterval() {
    return Math.max(URCHIN.minInterval, URCHIN.interval * URCHIN.intervalScale ** (state.level - 1));
  }

  /** The tide's sideways current right now, in pixels per second. */
  function tideDrift() {
    return Math.sin(state.tidePhase) * TIDE.drift;
  }

  /** A floating "+points" note at the catch, drawn by the renderer until it fades. */
  function showPopup(x, y, text) {
    state.popup.x = x;
    state.popup.y = y;
    state.popup.text = text;
    state.popup.life = 1;
  }

  /**
   * A sting or a snap lands. With a shield held the pearl shatters instead: no life
   * lost, no combo broken, and the caller hears EVENT_SHIELD. Without one it is a
   * real hit — combo gone, a life gone, a brief invulnerability — and EVENT_HIT.
   * Returns the event bit, or 0 when the game just ended (handled by the caller).
   */
  function takeHit() {
    // The sting is felt at the player: shards burst where she stands, whether
    // the pearl shattered or the sting got through.
    spawnHit(state.particles, player.x, player.y);
    if (state.shield) {
      state.shield = false;
      player.invulnerable = PLAYER.invulnerable;
      state.shake = 0.7;
      showPopup(player.x, player.y - 40, 'Shield held!');
      return EVENT_SHIELD;
    }
    state.combo = 0;
    state.lives -= 1;
    player.invulnerable = PLAYER.invulnerable;
    state.shake = 1;
    state.flash = 1;
    return EVENT_HIT;
  }

  /**
   * One fixed step. `move` is the player's velocity in field pixels per second (already
   * clamped to the player's speed). With `harmless` set (the title screen's backdrop) things
   * fall and drift but nothing is caught, nothing stings, and nothing scores.
   */
  function step(dt, move, harmless) {
    let events = 0;
    state.elapsed += dt;
    state.tidePhase += (Math.PI * 2 * dt) / TIDE.period;
    const level = Math.min(LEVEL.max, 1 + Math.floor(state.elapsed / LEVEL.seconds));
    if (level !== state.level) {
      state.level = level;
      // The banner stays up for two and a half seconds, long enough to read.
      state.levelBanner = 2.5;
      events |= EVENT_LEVEL;
    }
    if (state.levelBanner > 0) state.levelBanner = Math.max(0, state.levelBanner - dt);
    // The first-run hint for this moment of the game, or nothing once the
    // lessons have all had their turn. A hint only ever appears while playing.
    let hint = '';
    for (const lesson of HINTS) {
      if (state.elapsed >= lesson.at && state.elapsed < lesson.at + lesson.for) {
        hint = lesson.text;
        break;
      }
    }
    state.hint = hint;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.5);
    if (state.surge > 0) state.surge = Math.max(0, state.surge - dt);
    if (state.rush > 0) state.rush = Math.max(0, state.rush - dt);
    if (state.popup.life > 0) state.popup.life = Math.max(0, state.popup.life - dt * 0.9);
    // The spray and sparks move with the world, one step at a time.
    stepParticles(state.particles, dt);

    player.x = Math.min(FIELD.width - player.radius, Math.max(player.radius, player.x + move.x * dt));
    player.y = Math.min(FIELD.sandTop + 30, Math.max(FIELD.waterTop + 90, player.y + move.y * dt));
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    state.orbTimer -= dt;
    if (state.orbTimer <= 0) {
      spawnOrb();
      state.orbTimer += orbInterval();
    }
    state.shellTimer -= dt;
    if (state.shellTimer <= 0) {
      spawnShell();
      state.shellTimer += SHELL.interval + random() * SHELL.intervalJitter;
    }
    state.urchinTimer -= dt;
    if (state.urchinTimer <= 0) {
      spawnUrchin();
      state.urchinTimer += urchinInterval();
    }
    state.crabTimer -= dt;
    if (state.crabTimer <= 0) {
      spawnCrab();
      state.crabTimer += CRAB.interval + random() * CRAB.intervalJitter;
    }
    state.goldenTimer -= dt;
    if (state.goldenTimer <= 0) {
      spawnGolden();
      state.goldenTimer += GOLDEN.interval + random() * GOLDEN.intervalJitter;
    }
    state.pearlTimer -= dt;
    if (state.pearlTimer <= 0) {
      spawnPearl();
      state.pearlTimer += PEARL.interval + random() * PEARL.intervalJitter;
    }
    state.surgeTimer -= dt;
    if (state.surgeTimer <= 0) {
      spawnSurge();
      state.surgeTimer += SURGE.interval;
      if (!harmless) {
        spraySurge(state.particles);
        events |= EVENT_SURGE;
      }
    }

    const drift = tideDrift();
    const catchRadius = PLAYER.netRadius;
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.active) continue;
      item.y += item.speed * dt;
      item.x += (drift + Math.sin(state.tidePhase * 2 + item.phase) * item.wobble * 0.4) * dt;
      if (item.x < item.radius) item.x = item.radius;
      if (item.x > FIELD.width - item.radius) item.x = FIELD.width - item.radius;
      if (item.y > FIELD.height + 40) {
        item.active = false;
        // A missed orb breaks the combo; a missed urchin is a small mercy, and a
        // missed golden or pearl is only a missed chance.
        if (item.kind === KIND_ORB && !harmless) state.combo = 0;
        continue;
      }
      if (harmless) continue;
      const reach = catchRadius + item.radius;
      if (distanceSquared(item.x, item.y, player.x, player.y) > reach * reach) continue;
      if (item.kind === KIND_ORB) {
        item.active = false;
        state.combo += 1;
        if (state.combo > state.bestCombo) state.bestCombo = state.combo;
        const multiplier = 1 + Math.min(state.combo - 1, 9) * 0.25;
        // During the Golden Tide every orb is worth double: the rush is the
        // payoff for the shells, and the combo still stacks on top of it.
        const points = Math.round(ORB.points * multiplier * (state.rush > 0 ? 2 : 1));
        state.score += points;
        state.scoreOrbs += points;
        state.caught += 1;
        showPopup(item.x, item.y, `+${points}`);
        spawnCatch(state.particles, item.x, item.y, PALETTE.orb);
        events |= EVENT_CATCH;
        if (state.caught >= JAR_GOAL) {
          events |= EVENT_WIN;
          break;
        }
      } else if (item.kind === KIND_GOLDEN) {
        // Worth five orbs, but it never fills the jar: score against the win.
        item.active = false;
        state.score += GOLDEN.points;
        state.scoreGolden += GOLDEN.points;
        state.goldenCaught += 1;
        showPopup(item.x, item.y, `+${GOLDEN.points}`);
        spawnGolden(state.particles, item.x, item.y);
        events |= EVENT_CATCH | EVENT_GOLDEN;
      } else if (item.kind === KIND_PEARL) {
        item.active = false;
        state.pearlCaught += 1;
        if (state.shield) {
          state.score += PEARL.points;
          state.scorePickups += PEARL.points;
          showPopup(item.x, item.y, `+${PEARL.points}`);
        } else {
          state.shield = true;
          showPopup(item.x, item.y, 'Shield!');
        }
        spawnPearl(state.particles, item.x, item.y);
        events |= EVENT_PEARL;
      } else if (item.kind === KIND_SHELL) {
        item.active = false;
        state.score += SHELL.points;
        state.scorePickups += SHELL.points;
        state.shells += 1;
        showPopup(item.x, item.y, `+${SHELL.points}`);
        spawnCatch(state.particles, item.x, item.y, PALETTE.shell);
        events |= EVENT_SHELL;
        // Three shells open the Golden Tide: a bonus, ten seconds of orbs
        // worth double, and the shell count starts over.
        if (state.shells >= SHELL_BONUS.shellsNeeded) {
          state.shells = 0;
          state.score += SHELL_BONUS.points;
          state.scoreBonus += SHELL_BONUS.points;
          state.shellBonus += SHELL_BONUS.points;
          state.rush = SHELL_BONUS.rushSeconds;
          showPopup(item.x, item.y - 30, `Golden Tide! +${SHELL_BONUS.points}`);
          events |= EVENT_BONUS;
        }
      } else if (player.invulnerable === 0) {
        item.active = false;
        events |= takeHit();
        if (state.lives === 0) {
          events |= EVENT_OVER;
          break;
        }
      }
    }

    if (!(events & (EVENT_WIN | EVENT_OVER))) {
      for (const crab of crabs) {
        if (!crab.active) continue;
        crab.x += crab.direction * crab.speed * dt;
        if (crab.x < -CRAB.width - 10 || crab.x > FIELD.width + CRAB.width + 10) {
          crab.active = false;
          continue;
        }
        if (harmless || player.invulnerable > 0) continue;
        const dx = crab.x - player.x;
        const dy = crab.y - player.y;
        if (dx * dx + dy * dy < (CRAB.width / 2 + player.radius) ** 2) {
          events |= takeHit();
          if (state.lives === 0) events |= EVENT_OVER;
          break;
        }
      }
    }
    return events;
  }

  reset();
  return { state, reset, step, tideDrift };
}
