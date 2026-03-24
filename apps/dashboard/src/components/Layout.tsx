import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import useAuthStore from '../store/useAuthStore';
import { useTheme } from '../context/ThemeContext';

interface LayoutProps {
  children: React.ReactNode;
}

function getPosUrl(): string {
  const envUrl = import.meta.env['VITE_POS_URL'] as string | undefined;
  if (envUrl) return envUrl;
  if (window.location.port === '51820') return 'http://localhost:57445';
  return 'http://localhost:5173';
}

function BarChartIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>;
}
function SettingsIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></svg>;
}
function FileTextIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
}
function LogoutIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}
function SunIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /></svg>;
}
function MoonIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
}

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: <BarChartIcon /> },
  { to: '/settings', label: 'Einstellungen', icon: <SettingsIcon /> },
  { to: '/dep-export', label: 'DEP Export', icon: <FileTextIcon /> },
];

export default function Layout({ children }: LayoutProps) {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-[#080a0c]">
      <aside className="w-60 flex-shrink-0 bg-[#0e1115] border-r border-white/5 flex flex-col">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <span className="text-[#00e87a] font-bold text-xl tracking-tight">kassomat</span>
            <span className="ml-1 text-white/40 text-xs">admin</span>
          </div>
          <a
            href={getPosUrl()}
            target="_blank"
            rel="noopener noreferrer"
            title="Zur Kasse wechseln"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium text-white/50 hover:text-[#00e87a] hover:bg-[#00e87a]/10 border border-transparent hover:border-[#00e87a]/20 transition-all"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
            POS
          </a>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-[#00e87a]/10 text-[#00e87a]' : 'text-white/50 hover:text-white/80 hover:bg-white/5',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/5 space-y-1">
          {user && (
            <div className="px-3 py-2">
              <p className="text-white/80 text-sm font-medium truncate">{user.name}</p>
              <p className="text-white/40 text-xs truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            {theme === 'dark' ? 'Helles Theme' : 'Dunkles Theme'}
          </button>
          <button
            onClick={() => { logout(); navigate('/login'); }}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            <LogoutIcon />
            Abmelden
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
