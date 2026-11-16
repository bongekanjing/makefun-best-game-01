// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between five screens: title, play, paused, win and game over.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, JAR_GOAL, LIVES, PLAYER, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_CATCH, EVENT_HIT, EVENT_LEVEL, EVENT_OVER, EVENT_SHELL, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  // The staged scene is a still, but its state is announced like the live game's, so
  // the screen (and a play-test) can read what it shows.
  if (scene.screen === 'over') {
    status.textContent = `Game over. Score ${world.state.score}. Best ${scene.best}.`;
  } else if (scene.screen === 'win') {
    status.textContent = `The Moon Jar is full! Score ${world.state.score}. Best ${scene.best}.`;
  } else if (scene.screen === 'play') {
    status.textContent = `Playing. ${world.state.lives} lives. Fill the Moon Jar with ${JAR_GOAL} orbs.`;
  } else {
    status.textContent = 'Tideglass. Press Space or click to start.';
  }
  // The staged panel promises "Press Space or click to try again", so the still keeps
  // that promise: a confirm reloads the page into the live game.
  function restart() {
    window.location.href = window.location.pathname;
  }
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'Enter') restart();
  });
  canvas.addEventListener('pointerdown', restart);
  let painted = 0;
  function paint() {
    // Painted many times, not twice: the hit flash and shake fade a little per painted
    // frame, so a game-over scene staged from a final hit is not left tinted red.
    renderer.draw(world.state, scene.screen, scene.best, 0, STEP, 0);
    painted += 1;
    if (painted < 40) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${LIVES} lives. Fill the Moon Jar with ${JAR_GOAL} orbs.`);
  }

  function endGame(won) {
    screen = won ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (won) {
      audio.win();
      announce(`The Moon Jar is full! Score ${world.state.score}. Best ${best}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  /** The player's velocity this frame: keys, or steering toward a held pointer. */
  function moveVelocity() {
    const direction = input.direction();
    if (direction.x !== 0 || direction.y !== 0) {
      const length = Math.hypot(direction.x, direction.y);
      return { x: (direction.x / length) * PLAYER.speed, y: (direction.y / length) * PLAYER.speed };
    }
    const target = input.pointerTarget();
    if (target === null) return { x: 0, y: 0 };
    const field = renderer.toField(target.x, target.y);
    const dx = field.x - world.state.player.x;
    const dy = field.y - world.state.player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) return { x: 0, y: 0 };
    const speed = Math.min(PLAYER.speed, distance * 6);
    return { x: (dx / distance) * speed, y: (dy / distance) * speed };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, true);
      return 0;
    }
    const move = moveVelocity();
    const events = world.step(STEP, move, false);
    if (events & EVENT_WIN) endGame(true);
    else if (events & EVENT_OVER) endGame(false);
    else {
      if (events & EVENT_CATCH) audio.catchOrb(world.state.combo);
      if (events & EVENT_SHELL) audio.shell();
      if (events & EVENT_HIT) {
        audio.hit();
        announce(world.state.lives === 1 ? 'Stung! 1 life left.' : `Stung! ${world.state.lives} lives left.`);
      }
      if (events & EVENT_LEVEL) {
        audio.levelUp();
        announce(`Level ${world.state.level}. The tide quickens.`);
      }
    }
    return events;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    let events = 0;
    let moveX = 0;
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        const move = screen === SCREEN_PLAY ? moveVelocity() : { x: 0, y: 0 };
        moveX = move.x;
        events |= step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, events, STEP, moveX);
  }

  // Leaving the tab pauses a running game rather than letting orbs fall unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Tideglass. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
