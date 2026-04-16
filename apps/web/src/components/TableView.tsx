import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { formatCents } from '../lib/formatters';
import api from '../lib/api';
import type { TableLayout } from '@kassomat/types';

export default function TableView() {
  const { tabs, activeTabId, openTable, setMobileTab } = useAppStore();

  const { data: tables, isLoading } = useQuery<TableLayout[]>({
    queryKey: ['tables'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: TableLayout[] }>('/tables');
      return data.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#00e87a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!tables || tables.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#6b7280] gap-2 px-4">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="opacity-30">
          <rect x="3" y="8" width="18" height="12" rx="1" />
          <path d="M5 20v2M19 20v2M7 8V6a2 2 0 012-2h6a2 2 0 012 2v2" />
        </svg>
        <p className="text-sm text-center">Keine Tische angelegt</p>
        <p className="text-xs text-white/30 text-center">Tische in Einstellungen &rarr; Tischplan erstellen</p>
      </div>
    );
  }

  // Get table status from open tabs
  function getTableStatus(tableId: string) {
    const tab = tabs.find((t) => t.tableId === tableId);
    if (!tab || tab.items.length === 0) return { occupied: false, itemCount: 0, total: 0, isActive: false };
    const total = tab.items.reduce((sum, item) => sum + item.price * item.quantity - item.discount, 0);
    return {
      occupied: true,
      itemCount: tab.items.length,
      total,
      isActive: tab.id === activeTabId,
    };
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b border-white/[0.06] shrink-0">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider">Tischplan</p>
      </div>

      <div
        className="flex-1 relative overflow-hidden mx-3 my-2 bg-[#080a0c] rounded-xl border border-white/[0.06]"
        style={{ minHeight: '200px' }}
      >
        {tables.filter((t) => t.isActive).map((table) => {
          const status = getTableStatus(table.id);
          return (
            <button
              key={table.id}
              type="button"
              onClick={() => {
                openTable(table.id, table.label);
                setMobileTab('cart');
              }}
              className={`absolute flex flex-col items-center justify-center transition-all duration-150 hover:scale-105 active:scale-95 touch-none ${
                table.shape === 'round' ? 'rounded-full' : 'rounded-lg'
              } ${
                status.isActive
                  ? 'ring-2 ring-[#00e87a] shadow-lg shadow-[#00e87a]/20 z-10'
                  : ''
              }`}
              style={{
                left: `${table.x}%`,
                top: `${table.y}%`,
                width: `${table.width}%`,
                height: `${table.height}%`,
                backgroundColor: status.occupied
                  ? status.isActive ? 'rgba(0,232,122,0.2)' : 'rgba(0,232,122,0.1)'
                  : 'rgba(255,255,255,0.05)',
                border: `1px solid ${
                  status.occupied
                    ? status.isActive ? 'rgba(0,232,122,0.5)' : 'rgba(0,232,122,0.25)'
                    : 'rgba(255,255,255,0.1)'
                }`,
              }}
            >
              <span className={`text-[10px] font-semibold leading-none ${
                status.occupied ? 'text-[#00e87a]' : 'text-white/60'
              }`}>
                {table.label}
              </span>
              {status.occupied ? (
                <span className="text-[9px] text-[#00e87a]/70 mt-0.5 font-mono">
                  {formatCents(status.total)}
                </span>
              ) : (
                <span className="text-[8px] text-white/30 mt-0.5">{table.seats} Pl.</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
