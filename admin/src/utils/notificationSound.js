// Notification sound generator using Web Audio API (WhatsApp chime style)
let audioCtx = null;

export const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    // Primary note: crisp WhatsApp-style chime
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(784, now); // G5
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.08); // C6

    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.25, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.start(now);
    osc1.stop(now + 0.25);

    // Harmonic overtone: bright bell shimmer
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(1318.5, now + 0.04); // E6
    osc2.frequency.exponentialRampToValueAtTime(1567.98, now + 0.12); // G6

    gain2.gain.setValueAtTime(0.001, now + 0.04);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);

    osc2.start(now + 0.04);
    osc2.stop(now + 0.3);
  } catch (err) {
    console.debug("Notification sound error:", err);
  }
};
