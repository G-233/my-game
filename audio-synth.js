/* Loaded after inventory-system.js and before game.js; provides gesture-gated synthesized audio. */
(function (root) {
  "use strict";

  const game = root.NeonGame;
  let context = null;
  let enabled = true;

  try {
    const stored = root.localStorage.getItem(game.CONFIG.STORAGE_KEYS.audio);
    if (stored === "false") enabled = false;
  } catch (error) {
    if (!(error instanceof DOMException)) throw error;
    console.warn("无法读取音效设置，将仅在本次会话生效。", error);
  }

  function persist() {
    try {
      root.localStorage.setItem(game.CONFIG.STORAGE_KEYS.audio, String(enabled));
    } catch (error) {
      if (!(error instanceof DOMException)) throw error;
      console.warn("无法保存音效设置，将仅在本次会话生效。", error);
    }
  }

  function unlock() {
    if (!enabled) return;
    const AudioContextType = root.AudioContext || root.webkitAudioContext;
    if (!AudioContextType) return;
    if (!context) context = new AudioContextType();
    if (context.state === "suspended") {
      context.resume().catch(function (error) {
        console.warn("浏览器未能启用音效。", error);
      });
    }
  }

  function tone(frequency, duration, waveform, volume, endFrequency, startAt) {
    if (!context || !enabled) return;
    const start = context.currentTime + (startAt || 0);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = waveform || "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume || 0.04), start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function noise(duration, volume, frequency) {
    if (!context || !enabled) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = frequency || 1800;
    gain.gain.setValueAtTime(volume || 0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
  }

  const sounds = {
    place: function () { tone(620, 0.11, "sine", 0.035, 280); },
    explode: function () { noise(0.3, 0.12, 950); tone(105, 0.28, "sawtooth", 0.065, 42); },
    dye: function () { tone(420, 0.28, "triangle", 0.045, 1050); tone(690, 0.2, "sine", 0.025, 1240, 0.08); },
    steal: function () { tone(390, 0.11, "square", 0.025, 780); tone(780, 0.16, "triangle", 0.035, 1180, 0.1); },
    shield: function () { tone(260, 0.32, "sine", 0.045, 880); },
    drop: function () { tone(740, 0.12, "triangle", 0.035, 440); },
    pattern: function () { tone(520, 0.2, "triangle", 0.04, 780); tone(780, 0.24, "sine", 0.04, 1040, 0.12); },
    win: function () { tone(523, 0.3, "triangle", 0.05); tone(659, 0.3, "triangle", 0.05, 740, 0.16); tone(784, 0.45, "sine", 0.055, 1046, 0.32); },
    lose: function () { tone(360, 0.3, "triangle", 0.04, 270); tone(270, 0.42, "sine", 0.04, 150, 0.2); }
  };

  const audio = {
    unlock: unlock,
    play: function (name) {
      if (enabled && context && context.state === "running" && sounds[name]) sounds[name]();
    },
    setEnabled: function (value) {
      enabled = Boolean(value);
      if (enabled) unlock();
      else if (context && context.state === "running") {
        context.suspend().catch(function (error) {
          console.warn("浏览器未能暂停音效。", error);
        });
      }
      persist();
      return enabled;
    },
    get enabled() { return enabled; }
  };
  game.AUDIO = audio;
})(window);
