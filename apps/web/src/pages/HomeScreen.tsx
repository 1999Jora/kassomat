import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const tiles = [
  {
    id: 'pos',
    label: 'POS',
    sub: 'Kasse & Verkauf',
    path: '/pos',
    color: '#00e87a',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    id: 'nav',
    label: 'Liefer NAVI',
    sub: 'Fahrer-Navigation',
    path: '/delivery/nav',
    color: '#4f8ef7',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <polygon points="3 11 22 2 13 21 11 13 3 11" />
      </svg>
    ),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    sub: 'Statistiken & Daten',
    path: '/dashboard',
    color: '#a78bfa',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 20V10M12 20V4M6 20v-6" />
      </svg>
    ),
  },
  {
    id: 'rechnungen',
    label: 'Rechnungen',
    sub: 'Bons suchen & drucken',
    path: '/rechnungen',
    color: '#f59e0b',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: 'dispatcher',
    label: 'Dispatcher',
    sub: 'Lieferungen & Routen',
    path: '/dispatcher',
    color: '#f97316',
    icon: (
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12M4.93 19.07l2.12-2.12m9.9-9.9 2.12-2.12" />
      </svg>
    ),
  },
];

export default function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: '#080a0c' }}
    >
      {/* Subtle center glow */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% 45%, rgba(0,232,122,0.05) 0%, transparent 70%)',
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative flex flex-col items-center mb-12"
      >
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: '#00e87a',
            boxShadow: '0 0 32px rgba(0,232,122,0.25)',
          }}
        >
          <span className="text-black font-bold text-xl leading-none">K</span>
        </div>
        <h1 className="text-white font-semibold text-lg tracking-tight">Kassomat</h1>
      </motion.div>

      {/* Tiles */}
      <div className="relative grid grid-cols-2 gap-3 w-full max-w-[340px]">
        {tiles.map((tile, i) => (
          <motion.button
            key={tile.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.06 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(tile.path)}
            className="group relative flex flex-col items-start gap-3 rounded-2xl p-5 text-left transition-all duration-200 outline-none focus-visible:ring-2"
            style={{
              background: '#0e1115',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = tile.color + '40';
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 20px -4px ${tile.color}22`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            {/* Icon badge */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: tile.color + '18' }}
            >
              <span style={{ color: tile.color }}>{tile.icon}</span>
            </div>

            {/* Label */}
            <div>
              <p className="text-white font-semibold text-sm leading-tight">{tile.label}</p>
              <p className="text-white/35 text-xs mt-0.5 leading-tight">{tile.sub}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
