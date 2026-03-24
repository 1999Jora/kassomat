// ── Web Audio API sounds — no external files needed ──────────────────────────
// All sounds are generated programmatically for instant load and full control.

function getCtx(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  } catch {
    return null;
  }
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
 * Minimaler, weicher Klick für Artikeltasten (kaum wahrnehmbar, aber spürbar)
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
 * Kurzer positiver Ton für erfolgreiche Aktionen (Bon gedruckt, Zahlung etc.)
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
