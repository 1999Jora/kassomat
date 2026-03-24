// ── Web Audio API sounds — no external files needed ──────────────────────────
// Singleton AudioContext: muss einmalig durch User-Geste entsperrt werden.
// initAudio() beim ersten Klick aufrufen → danach funktionieren alle Töne.

let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!_ctx) {
    try {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      _ctx = new Ctor();
    } catch {
      return null;
    }
  }
  // Browser sperrt AudioContext bis zur ersten User-Geste — dann resumeen
  if (_ctx.state === 'suspended') {
    void _ctx.resume();
  }
  return _ctx;
}

/**
 * Beim ersten Klick irgendwo auf der Seite aufrufen,
 * damit der AudioContext entsperrt wird und Hintergrund-Töne funktionieren.
 */
export function initAudio(): void {
  const ctx = getCtx();
  if (ctx?.state === 'suspended') void ctx.resume();
}

/**
 * Angenehmer 3-Ton Chime bei Auftragseingang (C5 → E5 → G5 Dur-Dreiklang)
 */
export function playOrderChime(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;

    const t = ctx.currentTime + i * 0.2;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

    osc.start(t);
    osc.stop(t + 0.6);
  });
}

/**
 * Minimaler, weicher Klick für Artikeltasten
 */
export function playKeyClick(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = 'sine';
  osc.frequency.value = 1100;

  gain.gain.setValueAtTime(0.07, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);

  osc.start();
  osc.stop(ctx.currentTime + 0.06);
}

/**
 * Kurzer positiver Ton für Bon drucken / Zahlung
 */
export function playSuccess(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const notes = [659.25, 783.99]; // E5 → G5
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.value = freq;

    const t = ctx.currentTime + i * 0.12;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.start(t);
    osc.stop(t + 0.35);
  });
}
