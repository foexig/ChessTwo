// sound.js — Chess sound effects using Web Audio API (no external files needed)

const SoundFX = (() => {
  let ctx = null;
  let enabled = true;

  function init() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browsers require user interaction)
    if (ctx.state === 'suspended') ctx.resume();
  }

  // Create a short percussive sound (like wood click)
  function click(freq, duration, volume = 0.3, type = 'triangle') {
    if (!ctx || !enabled) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  // Create a noise burst (for capture/thud sounds)
  function thud(freq, duration, volume = 0.3) {
    if (!ctx || !enabled) return;
    // Use a combination of oscillator + noise for a richer sound
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.3, ctx.currentTime + duration);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);

    // Add a noise component
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.3, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration * 0.5);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(ctx.currentTime);
  }

  // Play a melodic tone (for check, checkmate, perks)
  function tone(freq, startTime, duration, volume = 0.2, type = 'sine') {
    if (!ctx || !enabled) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
    gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration);
  }

  const sounds = {
    move: () => {
      // Wooden "tock" — two quick frequencies
      click(180, 0.08, 0.25, 'triangle');
      click(120, 0.12, 0.15, 'sine');
    },

    capture: () => {
      // Harder "thock" with noise
      thud(150, 0.15, 0.35);
      click(80, 0.1, 0.2, 'square');
    },

    castle: () => {
      // Double tock
      click(180, 0.08, 0.2, 'triangle');
      setTimeout(() => click(180, 0.08, 0.2, 'triangle'), 80);
    },

    check: () => {
      // Warning chime — two ascending tones
      tone(523, 0, 0.15, 0.2, 'sine');    // C5
      tone(659, 0.08, 0.2, 0.2, 'sine');  // E5
    },

    checkmate: () => {
      // Dramatic descending tones
      tone(523, 0, 0.3, 0.25, 'sine');     // C5
      tone(415, 0.15, 0.3, 0.25, 'sine');   // G#4
      tone(311, 0.3, 0.4, 0.3, 'sine');     // D#4
      tone(208, 0.5, 0.6, 0.3, 'sine');    // G#3
    },

    draw: () => {
      // Neutral two-tone
      tone(440, 0, 0.2, 0.2, 'sine');  // A4
      tone(440, 0.15, 0.2, 0.15, 'sine');
    },

    gameStart: () => {
      // Pleasant ascending chime
      tone(392, 0, 0.12, 0.15, 'sine');   // G4
      tone(523, 0.08, 0.12, 0.15, 'sine'); // C5
      tone(659, 0.16, 0.2, 0.15, 'sine');  // E5
    },

    perkActivate: () => {
      // Magical shimmer — ascending fast tones
      tone(523, 0, 0.1, 0.15, 'sine');      // C5
      tone(659, 0.05, 0.1, 0.15, 'sine');   // E5
      tone(784, 0.1, 0.1, 0.15, 'sine');    // G5
      tone(1047, 0.15, 0.2, 0.2, 'sine');  // C6
    },

    perkUse: () => {
      // Whoosh-like sound
      thud(200, 0.2, 0.25);
      tone(880, 0.05, 0.15, 0.15, 'sine');
      tone(1100, 0.1, 0.2, 0.15, 'sine');
    },

    promote: () => {
      // Fanfare
      tone(523, 0, 0.1, 0.2, 'triangle');
      tone(659, 0.08, 0.1, 0.2, 'triangle');
      tone(784, 0.16, 0.1, 0.2, 'triangle');
      tone(1047, 0.24, 0.25, 0.25, 'triangle');
    },

    select: () => {
      // Soft click when selecting a piece
      click(300, 0.04, 0.1, 'sine');
    },

    invalid: () => {
      // Low buzz for invalid action
      tone(150, 0, 0.1, 0.15, 'sawtooth');
      tone(120, 0.05, 0.1, 0.1, 'sawtooth');
    }
  };

  return {
    init,
    play(name) {
      init();
      if (sounds[name]) sounds[name]();
    },
    setEnabled(val) { enabled = val; },
    isEnabled() { return enabled; }
  };
})();

window.SoundFX = SoundFX;
