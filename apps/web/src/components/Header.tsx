import { useState, useEffect } from 'react';
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

function getAdminUrl(): string {
  const envUrl = import.meta.env['VITE_DASHBOARD_URL'] as string | undefined;
  if (envUrl) return envUrl;
  if (window.location.port === '57445') return 'http://localhost:51820';
  return 'http://localhost:5174';
}

export default function Header({ onOrdersClick }: HeaderProps) {
  const { lock, pendingOrders } = useAppStore();
  const { theme, toggleTheme } = useTheme();
  const [now, setNow] = useState(new Date());

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
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#00e87a] flex items-center justify-center shadow-md shadow-[#00e87a]/20">
          <span className="text-black font-bold text-sm font-display leading-none">K</span>
        </div>
        <span className="font-bold text-sm tracking-tight">Kassomat</span>
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

        {/* Admin link */}
        <a
          href={getAdminUrl()}
          target="_blank"
          rel="noopener noreferrer"
          title="Admin-Bereich öffnen"
          className="min-w-[40px] min-h-[40px] w-10 h-10 rounded-xl bg-white/[0.05] hover:bg-white/10 active:bg-white/5 flex items-center justify-center transition-colors border border-white/[0.06]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </a>

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
