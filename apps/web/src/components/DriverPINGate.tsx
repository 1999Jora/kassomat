import { useState } from 'react';
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

  function handlePad(digit: string) {
    if (pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === 4 && selected) {
      // auto-verify on 4 digits
      setTimeout(() => {
        fetch(`${API}/drivers/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driverId: selected.id, pin: next }),
        }).then(async (res) => {
          if (!res.ok) { setError('Falscher PIN'); setPin(''); }
          else onSuccess(selected);
        }).catch(() => setError('Verbindungsfehler'));
      }, 100);
    }
  }

  if (!selected) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6 gap-4">
        <h2 className="text-xl font-bold text-white mb-2">Wer bist du?</h2>
        {drivers.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelected(d)}
            className="w-full max-w-xs py-4 rounded-xl font-semibold text-white text-lg"
            style={{ backgroundColor: d.color + '33', borderColor: d.color, borderWidth: 2 }}
          >
            {d.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6">
      <button onClick={() => { setSelected(null); setPin(''); }} className="text-white/40 text-sm mb-6">
        ← zurück
      </button>
      <h2 className="text-xl font-bold text-white mb-1">{selected.name}</h2>
      <p className="text-white/40 text-sm mb-8">PIN eingeben</p>

      {/* PIN dots */}
      <div className="flex gap-3 mb-8">
        {[0,1,2,3].map((i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${pin.length > i ? 'bg-white border-white' : 'border-white/30'}`} />
        ))}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, idx) => (
          <button
            key={idx}
            onClick={() => {
              if (d === '⌫') setPin(p => p.slice(0,-1));
              else if (d) handlePad(d);
            }}
            className="aspect-square rounded-xl bg-[#181c27] text-white text-xl font-medium hover:bg-[#1f2333] disabled:opacity-30"
            disabled={!d}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
