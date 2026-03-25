import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

const tiles = [
  {
    id: 'pos',
    label: 'POS',
    path: '/pos',
    icon: (
      <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    id: 'nav',
    label: 'Liefer NAVI',
    path: '/delivery/nav',
    icon: (
      <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: 'dispatcher',
    label: 'Dispatcher',
    path: '/dispatcher',
    icon: (
      <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10 text-center"
      >
        <div className="w-14 h-14 rounded-2xl bg-[#00e87a] flex items-center justify-center shadow-lg shadow-[#00e87a]/20 mx-auto mb-3">
          <span className="text-black font-bold text-2xl leading-none">K</span>
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">Kassomat</h1>
      </motion.div>

      <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
        {tiles.map((tile, i) => (
          <motion.button
            key={tile.id}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.07 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => navigate(tile.path)}
            className="flex flex-col items-center justify-center gap-3 bg-[#181c27] hover:bg-[#1f2333] border border-white/8 rounded-2xl p-8 text-white transition-colors cursor-pointer"
          >
            <span className="text-white/70">{tile.icon}</span>
            <span className="text-sm font-medium tracking-wide">{tile.label}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
