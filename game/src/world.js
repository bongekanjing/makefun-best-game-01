// The game's rules and state, with no drawing and no browser in it: Mara the tidekeeper,
// the pool of falling orbs, shells, urchins and scuttling crabs, the tide's sideways drift,
// the Moon Jar, score, combo, lives and level. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react without the world knowing about
// screens or sound. Nothing here allocates after createWorld returns.

import { CRAB, FIELD, JAR_GOAL, LEVEL, LIVES, ORB, PLAYER, POOL_SIZE, SHELL, TIDE, URCHIN } from './config.js';

export const KIND_ORB = 0;
export const KIND_SHELL = 1;
export const KIND_URCHIN = 2;

export const EVENT_CATCH = 1;
export const EVENT_SHELL = 2;
export const EVENT_HIT = 4;
export const EVENT_WIN = 8;
export const EVENT_OVER = 16;
export const EVENT_LEVEL = 32;

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
    shake: 0,
    flash: 0,
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
    state.shake = 0;
    state.flash = 0;
  }

  function freeItem() {
    for (let index = 0; index < items.length; index += 1) if (!items[index].active) return items[index];
    return null;
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
      events |= EVENT_LEVEL;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 2.2);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.5);

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
        // A missed orb breaks the combo; a missed urchin is a small mercy.
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
        state.score += Math.round(ORB.points * multiplier);
        state.caught += 1;
        events |= EVENT_CATCH;
        if (state.caught >= JAR_GOAL) {
          events |= EVENT_WIN;
          break;
        }
      } else if (item.kind === KIND_SHELL) {
        item.active = false;
        state.score += SHELL.points;
        events |= EVENT_SHELL;
      } else if (player.invulnerable === 0) {
        item.active = false;
        state.combo = 0;
        state.lives -= 1;
        player.invulnerable = PLAYER.invulnerable;
        state.shake = 1;
        state.flash = 1;
        events |= EVENT_HIT;
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
          state.combo = 0;
          state.lives -= 1;
          player.invulnerable = PLAYER.invulnerable;
          state.shake = 1;
          state.flash = 1;
          events |= EVENT_HIT;
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
