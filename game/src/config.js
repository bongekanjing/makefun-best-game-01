// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Tideglass: a tide-and-moon catching game. Mara the tidekeeper wades the shallows at
// night, catching glowing tideglass orbs in her net to fill the Moon Jar before the moon
// sets. Urchins sting, crabs snap; shells are worth a bonus. Fill the jar to win.

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

export const SHELL = {
  radius: 12,
  fall: 95,
  interval: 4.5,
  intervalJitter: 2.5,
  points: 25,
};

export const URCHIN = {
  radius: 17,
  fall: 85,
  fallPerLevel: 8,
  interval: 1.9,
  intervalScale: 0.88,
  minInterval: 0.7,
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
