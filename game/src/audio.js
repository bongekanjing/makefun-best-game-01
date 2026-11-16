// Synthesised sound only: every effect is a few WebAudio oscillators and noise, built at
// play time. No audio files, no network. The context is created on the first user gesture
// (browsers refuse sound before one), and M mutes everything.

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
    shell() {
      tone(784, 0.14, 'sine', 0.4);
      tone(1175, 0.26, 'sine', 0.3);
    },
    hit() {
      tone(160, 0.3, 'sawtooth', 0.5, 55);
      noise(0.18, 0.4, 900);
    },
    levelUp() {
      tone(392, 0.12, 'triangle', 0.4);
      tone(523, 0.12, 'triangle', 0.4);
      tone(659, 0.24, 'triangle', 0.4);
    },
    win() {
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((frequency, index) => {
        window.setTimeout(() => tone(frequency, 0.5, 'sine', 0.4), index * 110);
      });
    },
    lose() {
      const notes = [392, 330, 262, 196];
      notes.forEach((frequency, index) => {
        window.setTimeout(() => tone(frequency, 0.4, 'triangle', 0.35), index * 150);
      });
    },
    splash() {
      noise(0.12, 0.16, 1600);
    },
  };
}
