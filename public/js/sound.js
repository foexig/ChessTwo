// sound.js — Chess sound effects using real chess.com MP3 files

const SoundFX = (() => {
  let enabled = true;
  const audioCache = {};

  function loadSound(name) {
    if (audioCache[name]) return audioCache[name];
    const audio = new Audio(`/sounds/${name}.mp3`);
    audio.preload = 'auto';
    audioCache[name] = audio;
    return audio;
  }

  // Preload all sounds
  const SOUND_FILES = [
    'move-self', 'move-opponent', 'capture', 'castle',
    'move-check', 'game-end', 'game-start', 'game-draw',
    'promote', 'illegal', 'tenseconds', 'notify',
    'game-win-long', 'game-lose-long',
    'move-self-check', 'move-opponent-check'
  ];

  function preload() {
    for (const f of SOUND_FILES) loadSound(f);
  }

  function play(name) {
    if (!enabled) return;
    const audio = loadSound(name);
    if (!audio) return;
    audio.currentTime = 0;
    audio.volume = 0.6;
    audio.play().catch(() => {});
  }

  return {
    preload,
    play,
    setEnabled(val) { enabled = val; },
    isEnabled() { return enabled; }
  };
})();

window.SoundFX = SoundFX;
