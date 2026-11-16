// The screenshot scenes behind ?shot=start|play|end. Each one plays the real rules forward
// from a fresh world for a fixed number of steps, steered by a simple autopilot (chase the
// lowest orb, keep clear of urchins and crabs), so the frame is what a short game really
// looks like and the same seed always gives the same frame.

import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, KIND_ORB, KIND_URCHIN } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 30;
const END_LIMIT_SECONDS = 600;
/**
 * How far ahead, in seconds, the autopilot checks a hazard: the play scene's pilot looks
 * well ahead and keeps all its hearts; the end scene's looks only a moment ahead, so it is
 * caught out once the urchins speed up, as a hurried player is.
 */
const HORIZON_PLAY = 0.8;
const HORIZON_END = 0.25;
const SAMPLE = 1 / 30;

/**
 * The steering the autopilot wants this step, as a velocity in field pixels per second.
 * `hurried` is the end scene's pilot: it chases the lowest orb down to the sand, notices
 * a threat only at the last moment, and never climbs out of the falling lane — the way a
 * hurried player is caught out once the urchins speed up.
 */
function autopilot(state, horizon, hurried) {
  const player = state.player;
  // Mode one — flee: the nearest urchin or crab that will come within a net's reach of
  // the player inside `horizon` seconds if the player stays put. A short horizon means
  // threats are noticed late, which is what makes the end scene lose.
  let threatX = null;
  let threatSoon = Infinity;
  for (const item of state.items) {
    if (!item.active || item.kind !== KIND_URCHIN) continue;
    for (let t = SAMPLE; t <= horizon; t += SAMPLE) {
      const itemY = item.y + item.speed * t;
      const dx = item.x - player.x;
      const dy = itemY - player.y;
      if (dx * dx + dy * dy < (PLAYER.netRadius + item.radius + 14) ** 2) {
        if (t < threatSoon) {
          threatSoon = t;
          threatX = item.x;
        }
        break;
      }
    }
  }
  for (const crab of state.crabs) {
    if (!crab.active) continue;
    const dx = crab.x - player.x;
    const dy = crab.y - player.y;
    if (Math.abs(dx) < 130 && Math.abs(dy) < 100) {
      threatX = crab.x;
      threatSoon = 0;
    }
  }
  if (threatX !== null) {
    const away = player.x < threatX ? -1 : 1;
    // Flee sideways, and climb a little out of the falling lane (and off the sand,
    // where the crabs are) while doing it — unless hurried, which stays in the lane.
    return { x: away * PLAYER.speed, y: hurried ? 0 : -PLAYER.speed * 0.45 };
  }
  // Mode two — chase: the nearest orb a short look ahead, intercepted where it will be,
  // not chased down to the sand where the crabs live. The hurried pilot instead chases
  // the lowest orb, wherever it is.
  const LOOK = 0.7;
  let orb = null;
  if (hurried) {
    for (const item of state.items) {
      if (!item.active || item.kind !== KIND_ORB) continue;
      if (orb === null || item.y > orb.y) orb = { x: item.x, y: item.y };
    }
  } else {
    let orbDistance = Infinity;
    for (const item of state.items) {
      if (!item.active || item.kind !== KIND_ORB) continue;
      const px = item.x;
      const py = item.y + item.speed * LOOK;
      const distance = Math.hypot(px - player.x, py - player.y);
      if (distance < orbDistance) {
        orbDistance = distance;
        orb = { x: px, y: py };
      }
    }
  }
  if (orb === null) return { x: 0, y: 0 };
  const dx = orb.x - player.x;
  const dy = orb.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 16) return { x: 0, y: 0 };
  return { x: (dx / distance) * PLAYER.speed, y: (dy / distance) * PLAYER.speed };
}

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, { x: 0, y: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const horizon = name === 'end' ? HORIZON_END : HORIZON_PLAY;
  const hurried = name === 'end';
  let won = false;
  for (let index = 0; index < limit / STEP; index += 1) {
    const events = world.step(STEP, autopilot(world.state, horizon, hurried), false);
    if (events & EVENT_WIN) {
      won = true;
      break;
    }
    if (events & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  if (won) return { screen: SCREEN_WIN, best: world.state.score };
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}
