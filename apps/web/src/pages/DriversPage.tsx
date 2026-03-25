import { useState, useEffect } from 'react';
import useAuthStore from '../store/useAuthStore';

const API = import.meta.env.VITE_API_URL as string;
const COLORS = ['#4f8ef7', '#2dd4a0', '#f97316', '#a78bfa', '#f43f5e'];

interface Driver {
  id: string;
  name: string;
  pin: string;
  color: string;
  isActive: boolean;
}

export default function DriversPage() {
  const { token } = useAuthStore();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [color, setColor] = useState(COLORS[0]!);
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`${API}/drivers`, { headers })
      .then(r => r.json())
      .then(d => setDrivers(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createDriver() {
    if (!name.trim() || pin.length !== 4) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/drivers`, { method: 'POST', headers, body: JSON.stringify({ name, pin, color }) });
      const d = await res.json();
      setDrivers(prev => [...prev, d]);
      setName(''); setPin('');
    } catch {}
    setSaving(false);
  }

  async function toggleActive(driver: Driver) {
    try {
      const res = await fetch(`${API}/drivers/${driver.id}`, {
        method: 'PUT', headers, body: JSON.stringify({ isActive: !driver.isActive }),
      });
      const d = await res.json();
      setDrivers(prev => prev.map(x => x.id === d.id ? d : x));
    } catch {}
  }

  async function deleteDriver(id: string) {
    try {
      await fetch(`${API}/drivers/${id}`, { method: 'DELETE', headers });
      setDrivers(prev => prev.filter(x => x.id !== id));
    } catch {}
  }

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h2 className="text-white font-bold text-xl mb-1">Fahrer verwalten</h2>
        <p className="text-white/40 text-sm">Bis zu 3 Fahrer empfohlen</p>
      </div>

      {/* Existing drivers */}
      <div className="space-y-2">
        {loading && <p className="text-white/30 text-sm">Laden...</p>}
        {drivers.map(d => (
          <div key={d.id} className="bg-[#181c27] rounded-xl p-4 flex items-center gap-3 border border-white/5">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium">{d.name}</p>
              <p className="text-white/30 text-xs font-mono">PIN: {d.pin}</p>
            </div>
            <button
              onClick={() => toggleActive(d)}
              className={`text-xs px-3 py-1 rounded-lg ${d.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/30'}`}
            >
              {d.isActive ? 'Aktiv' : 'Inaktiv'}
            </button>
            <button onClick={() => deleteDriver(d.id)} className="text-red-400/60 hover:text-red-400 text-lg leading-none px-1">×</button>
          </div>
        ))}
      </div>

      {/* Add driver form */}
      <div className="bg-[#181c27] rounded-xl p-4 border border-white/8 space-y-3">
        <h3 className="text-white font-medium text-sm">Neuer Fahrer</h3>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none"
        />
        <input
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="PIN (4-stellig)"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none font-mono"
          inputMode="numeric"
        />
        <div className="flex gap-2">
          {COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-full border-2 transition-all"
              style={{ backgroundColor: c, borderColor: color === c ? 'white' : 'transparent' }}
            />
          ))}
        </div>
        <button
          onClick={createDriver}
          disabled={saving || !name.trim() || pin.length !== 4}
          className="w-full py-2.5 rounded-lg text-white font-medium text-sm disabled:opacity-40"
          style={{ backgroundColor: color }}
        >
          {saving ? 'Speichern...' : 'Fahrer hinzufügen'}
        </button>
      </div>
    </div>
  );
}
