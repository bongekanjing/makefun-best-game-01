// Synthesised sound only: every effect is a few WebAudio oscillators and noise, built at
// play time. No audio files, no network. The context is created on the first user gesture
// (browsers refuse sound before one), and M mutes everything. A short tune is written
// as a list of notes and played by one helper, so each effect is a line of music
// rather than a block of scheduling.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (context !== null) return true;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.22;
      master.connect(context.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(frequency, duration, type, volume, slideTo) {
    if (!ensure() || muted || context.state === 'suspended') return;
    try {
      void context.resume();
      const start = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      if (slideTo !== undefined) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + duration);
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration);
    } catch {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  function noise(duration, volume, lowpass) {
    if (!ensure() || muted || context.state === 'suspended') return;
    try {
      void context.resume();
      const start = context.currentTime;
      const length = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(start);
    } catch {
      // Sound is garnish: a failure here must never break the game.
    }
  }

  /** Play a list of notes in order, one every `gap` milliseconds. Each note is
   *  [frequency, duration] or [frequency, duration, type, volume]. */
  function sequence(notes, gap, fallbackType, fallbackVolume) {
    notes.forEach((note, index) => {
      const frequency = note[0];
      const duration = note[1];
      const type = note[2] ?? fallbackType;
      const volume = note[3] ?? fallbackVolume;
      window.setTimeout(() => tone(frequency, duration, type, volume), index * gap);
    });
  }

  return {
    /** Call from any user gesture so the browser lets sound start. */
    unlock() {
      ensure();
    },
    get isMuted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    /** A bright pluck; higher combos pluck higher. */
    catchOrb(combo) {
      const base = 523 * 2 ** (Math.min(combo, 12) / 12);
      tone(base, 0.16, 'sine', 0.5);
      tone(base * 1.5, 0.22, 'triangle', 0.25);
    },
    /** A golden orb: a bright three-note chime, higher than a plain catch. */
    golden() {
      sequence([[1047, 0.22], [1319, 0.22], [1568, 0.22]], 70, 'sine', 0.4);
    },
    /** A Moon Pearl: a soft two-note shimmer. */
    pearl() {
      tone(1175, 0.3, 'sine', 0.3);
      tone(1568, 0.4, 'sine', 0.22);
    },
    /** A shield shattering: a bright crack over a low thud. */
    shieldBreak() {
      tone(2093, 0.12, 'square', 0.22);
      tone(1568, 0.18, 'triangle', 0.3);
      tone(160, 0.25, 'sawtooth', 0.35, 70);
      noise(0.14, 0.3, 2400);
    },
    /** A tide surge: a fast rising run, like water coming in. */
    surge() {
      sequence([[392, 0.16], [494, 0.16], [587, 0.16], [784, 0.16]], 80, 'triangle', 0.35);
    },
    /** The Golden Tide opening: a bright five-note fanfare, gold and quick. */
    bonus() {
      sequence([[659, 0.16], [784, 0.16], [1047, 0.2], [1319, 0.24], [1568, 0.34]], 90, 'sine', 0.42);
    },
    shell() {
      tone(784, 0.14, 'sine', 0.4);
      tone(1175, 0.26, 'sine', 0.3);
    },
    hit() {
      tone(160, 0.3, 'sawtooth', 0.5, 55);
      noise(0.18, 0.4, 900);
    },
    levelUp() {
      sequence([[392, 0.12], [523, 0.12], [659, 0.24]], 0, 'triangle', 0.4);
    },
    win() {
      sequence([[523, 0.5], [659, 0.5], [784, 0.5], [1047, 0.5], [1319, 0.5]], 110, 'sine', 0.4);
    },
    lose() {
      sequence([[392, 0.4], [330, 0.4], [262, 0.4], [196, 0.4]], 150, 'triangle', 0.35);
    },
    splash() {
      noise(0.12, 0.16, 1600);
    },
  };
}
