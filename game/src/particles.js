// particles.js — the spray, sparks and bubbles that make a catch feel caught.
// A particle is a small, short-lived mark on the water: it has a kind, a position,
// a velocity, a size, a colour, a life (seconds left) and a spin. The world asks
// for a burst when something happens — an orb caught, a sting taken, a golden
// claimed, a surge arriving — and the renderer draws whatever is still alive.
// Nothing here touches the jar, the score or the lives; it is pure feedback,
// so a particle can never change whether the game is won or lost.

import { FIELD, STEP } from './config.js';

/** How long each kind of particle lives, in seconds. */
export const PARTICLE_LIFE = {
  droplet: 0.55,
  shard: 0.7,
  sparkle: 0.9,
  bubble: 1.6,
  ring: 0.45,
};

/** A droplet flies up and falls back under the tide's pull. */
const GRAVITY = 520;

/** A bubble rises slowly and wobbles as it climbs. */
const BUBBLE_RISE = 46;

/** A shard flies straight out from a burst and slows as it goes. */
const SHARD_DRAG = 0.86;

/** The particles keep their own seeded random, separate from the world's: a
 *  burst of spray must never change where the next orb falls, so the seeded
 *  game stays exactly the same with particles on as with them off. */
function mulberry(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createParticles() {
  return {
    random: mulberry(20261118),
    list: [],
  };
}

/** Keep the list short: a catch asks for a dozen marks at most, and old ones
 *  are already gone by the next catch. Nothing here allocates per frame. */
function push(particles, kind, x, y, vx, vy, radius, color, life) {
  if (particles.list.length >= 240) return;
  particles.list.push({ kind, x, y, vx, vy, radius, color, life, maxLife: life, spin: particles.random() * Math.PI * 2 });
}

/** A caught orb bursts into droplets the colour of the orb. */
export function spawnCatch(particles, x, y, color) {
  const n = 10;
  for (let i = 0; i < n; i += 1) {
    const angle = particles.random() * Math.PI * 2;
    const speed = 60 + particles.random() * 160;
    push(particles, 'droplet', x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 90, 2 + particles.random() * 3, color, PARTICLE_LIFE.droplet);
  }
  push(particles, 'ring', x, y, 0, 0, 6, color, PARTICLE_LIFE.ring);
}

/** A sting or a snap shatters into pale shards and a ring. */
export function spawnHit(particles, x, y) {
  const n = 14;
  for (let i = 0; i < n; i += 1) {
    const angle = particles.random() * Math.PI * 2;
    const speed = 120 + particles.random() * 200;
    push(particles, 'shard', x, y, Math.cos(angle) * speed, Math.sin(angle) * speed - 60, 2 + particles.random() * 3, '#f3e9c8', PARTICLE_LIFE.shard);
  }
  push(particles, 'ring', x, y, 0, 0, 10, '#f3e9c8', PARTICLE_LIFE.ring);
}

/** A golden orb claimed sends up a fan of gold sparkles. */
export function spawnGolden(particles, x, y) {
  const n = 16;
  for (let i = 0; i < n; i += 1) {
    const angle = -Math.PI / 2 + (particles.random() - 0.5) * Math.PI * 1.4;
    const speed = 90 + particles.random() * 220;
    push(particles, 'sparkle', x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, 2 + particles.random() * 3, '#ffd34d', PARTICLE_LIFE.sparkle);
  }
  push(particles, 'ring', x, y, 0, 0, 12, '#ffd34d', PARTICLE_LIFE.ring);
}

/** A pearl caught leaves a few bubbles rising toward the moon. */
export function spawnPearl(particles, x, y) {
  const n = 6;
  for (let i = 0; i < n; i += 1) {
    push(particles, 'bubble', x + (particles.random() - 0.5) * 24, y - particles.random() * 10, (particles.random() - 0.5) * 14, -BUBBLE_RISE - particles.random() * 20, 3 + particles.random() * 4, '#cfe9ff', PARTICLE_LIFE.bubble);
  }
}

/** A surge arriving kicks up spray along the waterline. */
export function spawnSurge(particles) {
  const n = 18;
  for (let i = 0; i < n; i += 1) {
    const x = particles.random() * FIELD.width;
    push(particles, 'droplet', x, FIELD.horizon + 6, (particles.random() - 0.5) * 60, -60 - particles.random() * 120, 2 + particles.random() * 2, '#9fc4e8', PARTICLE_LIFE.droplet);
  }
}

/** Move every live particle one step. Dead ones are dropped. */
export function stepParticles(particles, dt) {
  const steps = Math.max(1, Math.round(dt / STEP));
  for (let s = 0; s < steps; s += 1) {
    const alive = [];
    for (const p of particles.list) {
      p.life -= STEP;
      if (p.life <= 0) continue;
      if (p.kind === 'droplet') {
        p.vy += GRAVITY * STEP;
        p.x += p.vx * STEP;
        p.y += p.vy * STEP;
      } else if (p.kind === 'shard') {
        p.vx *= SHARD_DRAG;
        p.vy *= SHARD_DRAG;
        p.x += p.vx * STEP;
        p.y += p.vy * STEP;
        p.spin += STEP * 9;
      } else if (p.kind === 'sparkle') {
        p.vy += GRAVITY * 0.35 * STEP;
        p.x += p.vx * STEP;
        p.y += p.vy * STEP;
        p.spin += STEP * 12;
      } else if (p.kind === 'bubble') {
        p.y += p.vy * STEP;
        p.x += Math.sin((p.maxLife - p.life) * 6 + p.spin) * 0.35;
      } else if (p.kind === 'ring') {
        p.radius += 130 * STEP;
      }
      alive.push(p);
    }
    particles.list = alive;
  }
}

/** How much of a particle is left, from 1 (born) to 0 (gone). */
function fade(p) {
  return Math.max(0, p.life / p.maxLife);
}

/** Draw every live particle. A droplet is a dot, a shard a turning splinter,
 *  a sparkle a four-point star, a bubble a thin ring, a ring a widening circle. */
export function drawParticles(ctx, particles) {
  for (const p of particles.list) {
    const a = fade(p);
    if (p.kind === 'droplet') {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (0.5 + a * 0.5), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'shard') {
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.beginPath();
      ctx.moveTo(-p.radius, 0);
      ctx.lineTo(p.radius, 0);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'sparkle') {
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.6;
      const r = p.radius * (0.6 + a * 0.4);
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y);
      ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r);
      ctx.lineTo(p.x, p.y + r);
      ctx.stroke();
    } else if (p.kind === 'bubble') {
      ctx.globalAlpha = a * 0.7;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === 'ring') {
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.5 * a + 0.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}
