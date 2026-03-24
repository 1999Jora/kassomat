import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { login } from '../lib/api';

const CORRECT_PIN = '1234';

function hasToken() {
  return !!localStorage.getItem('kassomat_access_token');
}

// ── Email/Password login (first time) ─────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      onSuccess();
    } catch {
      setError('E-Mail oder Passwort falsch');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-72 space-y-3">
      <div>
        <label className="block text-xs text-white/50 mb-1">E-Mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="deine@email.at"
          required
          autoFocus
          className="w-full bg-[#0e1115] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
            placeholder:text-white/25 focus:outline-none focus:border-[#00e87a]/50"
        />
      </div>
      <div>
        <label className="block text-xs text-white/50 mb-1">Passwort</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full bg-[#0e1115] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm
            placeholder:text-white/25 focus:outline-none focus:border-[#00e87a]/50"
        />
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[#00e87a] text-black font-semibold py-2.5 rounded-lg text-sm
          hover:bg-[#00d46e] transition-colors disabled:opacity-50"
      >
        {loading ? 'Anmelden…' : 'Anmelden'}
      </button>
    </form>
  );
}

// ── PIN pad (re-lock) ──────────────────────────────────────────────────────────

function PINPad({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  function handleKey(k: string) {
    if (!k) return;
    if (k === '⌫') { setPin((p) => p.slice(0, -1)); setError(false); return; }
    if (pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) {
      if (next === CORRECT_PIN) {
        setTimeout(onSuccess, 250);
      } else {
        setShake(true);
        setTimeout(() => { setPin(''); setError(true); setShake(false); }, 400);
      }
    }
  }

  return (
    <>
      <div className={`flex gap-5 transition-transform ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`w-5 h-5 rounded-full border-2 transition-all duration-150 ${
            i < pin.length
              ? error ? 'border-red-500 bg-red-500 scale-110' : 'border-[#00e87a] bg-[#00e87a] scale-110'
              : 'border-white/25 bg-transparent'
          }`} />
        ))}
      </div>
      {error && <p className="text-red-400 text-sm -mt-5 animate-pulse">Falscher PIN</p>}
      <div className="grid grid-cols-3 gap-2.5 w-52">
        {KEYS.map((k, i) => (
          <button key={i} type="button" onClick={() => handleKey(k)} disabled={!k}
            className={`min-h-[56px] rounded-xl font-mono text-xl font-medium transition-all duration-100 select-none
              ${k ? 'bg-[#0e1115] border border-white/[0.06] text-white hover:bg-white/10 active:scale-95' : 'invisible pointer-events-none'}
              ${k === '⌫' ? 'text-[#6b7280]' : ''}`}
          >
            {k === '⌫' ? (
              <span className="flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" /><line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              </span>
            ) : k}
          </button>
        ))}
      </div>
      <p className="text-[#6b7280] text-xs">PIN: <span className="text-white/50 font-mono">1234</span></p>
    </>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PINLock() {
  const unlock = useAppStore((s) => s.unlock);
  const [loggedIn, setLoggedIn] = useState(hasToken);

  return (
    <div className="fixed inset-0 bg-[#080a0c] flex flex-col items-center justify-center gap-8 z-50">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[#00e87a] flex items-center justify-center shadow-lg shadow-[#00e87a]/20">
          <span className="text-black font-bold text-xl">K</span>
        </div>
        <div>
          <p className="font-bold text-lg leading-none tracking-tight">Kassomat</p>
          <p className="text-[#6b7280] text-xs mt-0.5">{loggedIn ? 'Kasse gesperrt' : 'Anmelden'}</p>
        </div>
      </div>

      {loggedIn ? (
        <PINPad onSuccess={unlock} />
      ) : (
        <LoginForm onSuccess={() => { setLoggedIn(true); unlock(); }} />
      )}
    </div>
  );
}
