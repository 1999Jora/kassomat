import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { formatTime } from '../lib/formatters';
import api from '../lib/api';
import { useTheme } from '../context/ThemeContext';
import type { Tenant } from '@kassomat/types';

interface HeaderProps {
  onOrdersClick: () => void;
}

function StatusDot({ label, online }: { label: string; online: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2 h-2 rounded-full ${
          online ? 'bg-[#00e87a] shadow-[0_0_6px_#00e87a]' : 'bg-white/20'
        }`}
      />
      <span className="text-[10px] text-[#6b7280] uppercase tracking-wider hidden lg:block">
        {label}
      </span>
    </div>
  );
}

export default function Header({ onOrdersClick }: HeaderProps) {
  const { lock, pendingOrders } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: tenant } = useQuery<Tenant>({
    queryKey: ['tenant'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: Tenant }>('/tenant');
      return data.data;
    },
    staleTime: 60_000,
    retry: false,
  });

  const wixOnline = tenant?.settings?.wix?.isActive ?? false;
  const lieferandoOnline = tenant?.settings?.lieferando?.isActive ?? false;
  const atrustOnline = tenant?.settings?.atrust?.configured ?? false;

  return (
    <header className="flex items-center justify-between px-4 h-14 bg-[#0e1115] border-b border-white/[0.06] shrink-0 z-10">
      {/* Left: burger + logo */}
      <div className="flex items-center gap-2">
        {/* Navigation menu */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="Menü"
            className="min-w-[36px] min-h-[36px] w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/10 flex items-center justify-center transition-colors border border-white/[0.06]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-12 w-52 bg-[#0e1115] border border-white/[0.08] rounded-xl shadow-2xl z-50 overflow-hidden py-1">
              {[
                { label: 'Home', to: '/', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/><path d="M3 12v9h18V12"/></svg> },
                { label: 'Übersicht', to: '/dashboard', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
                { label: 'Dispatcher', to: '/dispatcher', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><circle cx="12" cy="11" r="3"/></svg> },
                { label: 'Einstellungen', to: '/settings', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
                { label: 'DEP Export', to: '/dep-export', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> },
              ].map((item) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => { navigate(item.to); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/60 hover:bg-white/[0.05] hover:text-white transition-colors flex items-center gap-3"
                >
                  <span className="text-white/40">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-5 bg-white/[0.08] mx-1" />

        <div className="w-7 h-7 rounded-lg bg-[#00e87a] flex items-center justify-center shadow-md shadow-[#00e87a]/20">
          <span className="text-black font-bold text-xs leading-none">K</span>
        </div>
        <span className="font-bold text-sm tracking-tight hidden sm:block">Kassomat</span>
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-4 lg:gap-5">
        <StatusDot label="A-Trust" online={atrustOnline} />
        <StatusDot label="Wix" online={wixOnline} />
        <StatusDot label="Lieferando" online={lieferandoOnline} />
      </div>

      {/* Right: time + cashier + actions */}
      <div className="flex items-center gap-2">
        <div className="hidden sm:flex flex-col items-end mr-1">
          <p className="text-xs text-white/80 leading-tight">
            {tenant?.name ?? 'Demo Kassierer'}
          </p>
          <p className="text-[10px] text-[#6b7280] font-mono">{formatTime(now)}</p>
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Helles Theme' : 'Dunkles Theme'}
          className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 active:bg-white/5 flex items-center justify-center transition-colors border border-white/[0.06]"
        >
          {theme === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* Order queue button */}
        <button
          type="button"
          onClick={onOrdersClick}
          aria-label="Bestellungen"
          className="relative min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 active:bg-white/5 flex items-center justify-center transition-colors border border-white/[0.06]"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <line x1="9" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="13" y2="16" />
          </svg>
          {pendingOrders.length > 0 && (
            <span className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-[#00e87a] text-black text-[9px] font-bold flex items-center justify-center leading-none">
              {pendingOrders.length > 9 ? '9+' : pendingOrders.length}
            </span>
          )}
        </button>

        {/* Lock button */}
        <button
          type="button"
          onClick={lock}
          aria-label="Kasse sperren"
          className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 active:bg-white/5 flex items-center justify-center transition-colors border border-white/[0.06]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </button>
      </div>
    </header>
  );
}
