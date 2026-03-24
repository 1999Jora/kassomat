import { NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/useAuthStore';

const NAV = [
  { to: '/', label: 'POS', icon: '🧾', exact: true },
  { to: '/dashboard', label: 'Übersicht', icon: '📊' },
  { to: '/settings', label: 'Einstellungen', icon: '⚙️' },
  { to: '/dep-export', label: 'DEP Export', icon: '📤' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="h-screen bg-[#080a0c] text-white flex overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0a0c10]">
        <div className="px-4 py-5 border-b border-white/[0.06]">
          <p className="text-xs font-bold text-[#00e87a] uppercase tracking-wider">Kassomat</p>
          {user && <p className="text-[10px] text-[#6b7280] mt-0.5 truncate">{user.email}</p>}
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-[#00e87a]/10 text-[#00e87a] font-medium'
                    : 'text-[#6b7280] hover:text-white hover:bg-white/[0.05]'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-2 border-t border-white/[0.06]">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-[#6b7280] hover:text-red-400 hover:bg-red-900/10 transition-colors"
          >
            <span>🚪</span>
            <span>Abmelden</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
