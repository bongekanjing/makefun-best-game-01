// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Tideglass: a tide-and-moon catching game. Mara the tidekeeper wades the shallows at
// night, catching glowing tideglass orbs in her net to fill the Moon Jar before the moon
// sets. Urchins sting, crabs snap; shells are worth a bonus. Fill the jar to win.
//
// The loop has three decisions, not one: chase the fast golden orbs for 50 points
// apiece (they do not fill the jar, so they trade score against the win), grab a
// Moon Pearl before a risky catch (it shields exactly one sting), and ride the tide
// surges — every 45 seconds a shower of orbs falls at once, worth a burst of catches
// if Mara is in position. Golden orbs and pearls are rare on purpose: each one the
// player meets is a small choice, not background noise.

export const FIELD = { width: 1280, height: 720, waterTop: 150, sandTop: 600 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Orbs to catch to fill the Moon Jar and win the game. */
export const JAR_GOAL = 30;

export const PLAYER = {
  radius: 26,
  speed: 420,
  invulnerable: 1.6,
  netRadius: 46,
};

export const LIVES = 3;

export const ORB = {
  radius: 13,
  fall: 120,
  fallPerLevel: 12,
  fallJitter: 50,
  interval: 0.85,
  intervalScale: 0.9,
  minInterval: 0.32,
  points: 10,
};

/** A golden tideglass orb: rare, fast, and worth five orbs' points — but it does not
 *  fill the Moon Jar, so chasing one trades score against the win. One at a time.
 *  The first falls early enough to meet a new player (and the play screenshot). */
export const GOLDEN = {
  radius: 16,
  fall: 195,
  fallJitter: 25,
  interval: 14,
  intervalJitter: 8,
  points: 50,
};

/** A Moon Pearl: rare, slow, and worth catching before a risky move — it shields
 *  exactly one sting or snap, then shatters. One shield at a time; a pearl caught
 *  while shielded is worth its points instead. Pearls are deliberately scarce, so
 *  a shield is a precious resource and not a safety net a hurried player can lean on. */
export const PEARL = {
  radius: 13,
  fall: 80,
  interval: 35,
  intervalJitter: 10,
  points: 15,
};

export const SHELL = {
  radius: 12,
  fall: 95,
  interval: 4.5,
  intervalJitter: 2.5,
  points: 25,
};

/** A shell is worth 25 points on its own — but three shells in a row open the
 *  Golden Tide: ten seconds when every orb is worth double. Shells are a choice,
 *  not a distraction: chase them and the jar fills slower, but the score leaps. */
export const SHELL_BONUS = {
  shellsNeeded: 3,
  points: 100,
  rushSeconds: 10,
};

/** The first-run hints: short lessons shown one at a time over the opening
 *  seconds, so a new player learns the controls and the three choices without
 *  reading a manual. Each hint shows for a few seconds, then the next takes over;
 *  after the last one the game stops teaching and just plays. */
export const HINTS = [
  { at: 0.5, for: 4, text: 'Move with ← → ↑ ↓ or WASD, or hold the mouse' },
  { at: 5, for: 4, text: 'Catch the falling orbs to fill the Moon Jar' },
  { at: 9.5, for: 4, text: 'Golden orbs are worth 50 — but never fill the jar' },
  { at: 14, for: 4, text: 'Grab a Moon Pearl: it shields one sting' },
  { at: 18.5, for: 4, text: 'Three shells open the Golden Tide: orbs worth double' },
];

export const URCHIN = {
  radius: 17,
  fall: 85,
  fallPerLevel: 8,
  interval: 1.9,
  intervalScale: 0.88,
  minInterval: 0.7,
};

/** A tide surge: every SURGE.interval seconds a shower of SURGE.count orbs falls
 *  at once across the field, with a banner and a rising sound. Surges stop once
 *  the jar is nearly full, so the endgame stays about the last few orbs. */
export const SURGE = {
  interval: 45,
  count: 5,
  stopWhenCaughtLeft: 6,
};

export const CRAB = {
  width: 46,
  height: 26,
  speed: 150,
  speedPerLevel: 14,
  interval: 6.5,
  intervalJitter: 2.0,
};

/** Seconds of play per level; level 8 is the last, speeds and spawn rates stop growing there. */
export const LEVEL = { seconds: 14, max: 8 };

/** How many falling things can exist at once; the pool is allocated once, at boot. */
export const POOL_SIZE = 72;

/** The tide's sway: seconds per full in-and-out, and how far the current pushes things. */
export const TIDE = { period: 9, drift: 55 };

export const PALETTE = {
  backdrop: '#070b1d',
  skyTop: '#0b1030',
  skyBottom: '#1d2b52',
  moon: '#f6ead0',
  moonGlow: '#ffe9a8',
  star: '#dfe8ff',
  duneFar: '#1a2347',
  duneNear: '#141c38',
  waterTop: '#274b7a',
  waterDeep: '#12294d',
  sand: '#c9a86a',
  sandWet: '#8a6f42',
  player: '#7fe0c3',
  playerDark: '#2e8f76',
  net: '#e8f4ff',
  orb: '#ffd76a',
  orbCore: '#fff3c4',
  golden: '#ffb52e',
  goldenCore: '#fff0b8',
  goldenRay: '#ffe9a8',
  pearl: '#dff4ff',
  pearlCore: '#ffffff',
  pearlRing: '#9fd8ff',
  shield: '#9fd8ff',
  shell: '#ff9ecf',
  urchin: '#b678e8',
  crab: '#ff7a5c',
  panel: '#101736',
  panelEdge: '#3d5a8f',
  text: '#f2f0e4',
  muted: '#aab4d4',
  danger: '#ff6b6b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'tideglass.best';
