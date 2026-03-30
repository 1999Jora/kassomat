import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Driver } from '@kassomat/types';

const API = import.meta.env.VITE_API_URL as string;

interface Props {
  drivers: Driver[];
  onSuccess: (driver: Driver) => void;
}

export default function DriverPINGate({ drivers, onSuccess }: Props) {
  const [selected, setSelected] = useState<Driver | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handlePad(digit: string) {
    if (pin.length >= 4 || loading) return;
    const next = pin + digit;
    setPin(next);
    setError('');

    if (next.length === 4 && selected) {
      setLoading(true);
      try {
        const res = await fetch(`${API}/drivers/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driverId: selected.id, pin: next }),
        });
        if (!res.ok) {
          setError('Falscher PIN');
          setPin('');
        } else {
          const data = await res.json();
          // Save tenantId + driverId + PIN for subsequent API calls
          if (data.driver?.tenantId) {
            localStorage.setItem('kassomat_driver_tenant', data.driver.tenantId);
          }
          localStorage.setItem('kassomat_driver_id', selected.id);
          localStorage.setItem('kassomat_driver_pin', next);
          onSuccess(selected);
        }
      } catch {
        setError('Verbindungsfehler');
        setPin('');
      } finally {
        setLoading(false);
      }
    }
  }

  function handleBackspace() {
    setPin(p => p.slice(0, -1));
    setError('');
  }

  // ── Driver selection screen ────────────────────────────────────────────────
  if (!selected) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: '#080a0c' }}
      >
        {/* bg glow */}
        <div
          className="pointer-events-none fixed inset-0"
          style={{ background: 'radial-gradient(ellipse 50% 35% at 50% 50%, rgba(79,142,247,0.06) 0%, transparent 70%)' }}
        />

        {/* Back */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-5 left-5 flex items-center gap-1.5 text-white/35 hover:text-white/70 text-sm transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Home
        </button>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative flex flex-col items-center w-full max-w-xs"
        >
          <p className="text-white/40 text-xs tracking-widest uppercase mb-2">Fahrer</p>
          <h2 className="text-white font-bold text-2xl mb-8">Wer bist du?</h2>

          {drivers.length === 0 ? (
            <div className="text-center px-6 py-8 rounded-2xl border border-white/6 bg-white/[0.03] w-full">
              <p className="text-white/40 text-sm mb-1">Keine Fahrer konfiguriert</p>
              <p className="text-white/25 text-xs">Bitte im Dashboard unter "Fahrer" anlegen.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 w-full">
              {drivers.map((d, i) => (
                <motion.button
                  key={d.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.05 }}
                  onClick={() => setSelected(d)}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all duration-150"
                  style={{
                    background: d.color + '12',
                    border: `1px solid ${d.color}30`,
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = d.color + '60';
                    (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px -6px ${d.color}44`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = d.color + '30';
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ background: d.color + '25', color: d.color }}
                  >
                    {d.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-semibold text-base">{d.name}</span>
                  <svg className="ml-auto opacity-30" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </motion.button>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ── PIN entry screen ───────────────────────────────────────────────────────
  const pad = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: '#080a0c' }}
    >
      {/* bg glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: `radial-gradient(ellipse 40% 30% at 50% 50%, ${selected.color}0a 0%, transparent 70%)` }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="relative flex flex-col items-center w-full max-w-[280px]"
      >
        {/* Back */}
        <button
          onClick={() => { setSelected(null); setPin(''); setError(''); }}
          className="absolute -top-10 left-0 flex items-center gap-1.5 text-white/35 hover:text-white/70 text-sm transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Zurück
        </button>

        {/* Driver avatar */}
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold mb-4"
          style={{ background: selected.color + '20', color: selected.color, border: `2px solid ${selected.color}40`, boxShadow: `0 0 24px ${selected.color}30` }}
        >
          {selected.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-white font-bold text-xl mb-1">{selected.name}</h2>
        <p className="text-white/35 text-sm mb-8">PIN eingeben</p>

        {/* PIN dots */}
        <div className="flex gap-4 mb-3">
          {[0,1,2,3].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: pin.length === i + 1 ? [1, 1.3, 1] : 1 }}
              transition={{ duration: 0.15 }}
              className="w-3.5 h-3.5 rounded-full transition-all duration-150"
              style={{
                background: pin.length > i ? selected.color : 'transparent',
                border: `2px solid ${pin.length > i ? selected.color : 'rgba(255,255,255,0.2)'}`,
                boxShadow: pin.length > i ? `0 0 8px ${selected.color}80` : 'none',
              }}
            />
          ))}
        </div>

        {/* Error */}
        <div className="h-5 mb-5 flex items-center">
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-red-400 text-xs"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2.5 w-full">
          {pad.map((d, idx) => {
            const isBackspace = d === '⌫';
            const isEmpty = d === '';
            return (
              <button
                key={idx}
                onClick={() => {
                  if (isBackspace) handleBackspace();
                  else if (!isEmpty) handlePad(d);
                }}
                disabled={isEmpty || loading}
                className={[
                  'aspect-square rounded-2xl text-white font-semibold text-xl transition-all duration-100 select-none',
                  isEmpty ? 'pointer-events-none opacity-0' : '',
                  isBackspace ? 'text-white/50 hover:text-white/80' : '',
                  !isEmpty ? 'active:scale-95' : '',
                ].join(' ')}
                style={{
                  background: isEmpty ? 'transparent' : 'rgba(255,255,255,0.05)',
                  border: isEmpty ? 'none' : '1px solid rgba(255,255,255,0.07)',
                }}
                onMouseEnter={(e) => {
                  if (!isEmpty && !isBackspace) {
                    (e.currentTarget as HTMLElement).style.background = selected.color + '18';
                    (e.currentTarget as HTMLElement).style.borderColor = selected.color + '40';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isEmpty && !isBackspace) {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.07)';
                  }
                }}
              >
                {loading && d === '0' ? (
                  <svg className="animate-spin mx-auto" width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : d}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
