import { useAppStore } from '../store/useAppStore';
import { formatCents } from '../lib/formatters';

const CHANNEL_CONFIG: Record<string, { label: string; cls: string }> = {
  direct: { label: 'Direkt', cls: 'bg-white/[0.08] text-white/50 border-white/[0.06]' },
  lieferando: { label: 'Lieferando', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  wix: { label: 'Wix', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
};

export default function Cart() {
  const { cartItems, cartChannel, updateQuantity, removeFromCart, clearCart } = useAppStore();

  const totals = cartItems.reduce(
    (acc, item) => {
      const gross = item.price * item.quantity - item.discount;
      const vatFactor = item.vatRate / (100 + item.vatRate);
      const vat = Math.round(gross * vatFactor);
      const net = gross - vat;
      acc.gross += gross;
      acc.vat += vat;
      acc.net += net;
      if (item.vatRate === 0) acc.vat0 += vat;
      else if (item.vatRate === 10) acc.vat10 += vat;
      else acc.vat20 += vat;
      return acc;
    },
    { gross: 0, vat: 0, net: 0, vat0: 0, vat10: 0, vat20: 0 },
  );

  const channel = CHANNEL_CONFIG[cartChannel] ?? CHANNEL_CONFIG.direct;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-11 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-white/40"
          >
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          <span className="text-xs font-semibold text-white/80">Bon</span>
          <span className={`px-1.5 py-0.5 rounded border text-[9px] font-medium ${channel.cls}`}>
            {channel.label}
          </span>
          {cartItems.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-white/[0.06] text-[9px] text-white/40 font-mono">
              {cartItems.reduce((s, i) => s + i.quantity, 0)} Pos.
            </span>
          )}
        </div>
        {cartItems.length > 0 && (
          <button
            type="button"
            onClick={clearCart}
            className="text-[10px] text-[#6b7280] hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Leeren
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto scrollbar-none">
        {cartItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#6b7280] gap-2 px-6 py-12">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center mb-1">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                className="opacity-40"
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white/30">Bon ist leer</p>
            <p className="text-xs opacity-50 text-center">Artikel antippen zum Hinzufügen</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {cartItems.map((item) => (
              <div key={item.productId} className="flex items-center gap-2 px-3 py-2.5 hover:bg-white/[0.02] group">
                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white leading-tight truncate">{item.name}</p>
                  <p className="text-[10px] text-[#6b7280] mt-0.5 font-mono">
                    {formatCents(item.price)} · {item.vatRate}% MwSt
                    {item.discount > 0 && (
                      <span className="ml-1 text-[#00e87a]">−{formatCents(item.discount)}</span>
                    )}
                  </p>
                </div>

                {/* Qty stepper */}
                <div className="flex items-center shrink-0 bg-white/[0.05] rounded-lg border border-white/[0.06] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-xs font-mono text-white select-none">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="min-w-[28px] min-h-[28px] flex items-center justify-center text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Line total */}
                <div className="text-right shrink-0 w-14">
                  <p className="text-xs font-medium font-mono text-white">
                    {formatCents(item.price * item.quantity - item.discount)}
                  </p>
                </div>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => removeFromCart(item.productId)}
                  className="min-w-[24px] min-h-[24px] w-6 h-6 rounded flex items-center justify-center text-white/15 hover:text-red-400 hover:bg-red-900/20 transition-all shrink-0 opacity-0 group-hover:opacity-100"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals breakdown */}
      {cartItems.length > 0 && (
        <div className="px-4 py-3 border-t border-white/[0.06] space-y-1.5 shrink-0 bg-[#080a0c]/40">
          {/* MwSt breakdown */}
          <div className="space-y-1 pb-1.5 border-b border-white/[0.05]">
            <div className="flex justify-between text-[10px] text-[#6b7280]">
              <span>Netto</span>
              <span className="font-mono">{formatCents(totals.net)}</span>
            </div>
            {totals.vat0 > 0 && (
              <div className="flex justify-between text-[10px] text-[#6b7280]">
                <span>MwSt 0%</span>
                <span className="font-mono">{formatCents(totals.vat0)}</span>
              </div>
            )}
            {totals.vat10 > 0 && (
              <div className="flex justify-between text-[10px] text-[#6b7280]">
                <span>MwSt 10%</span>
                <span className="font-mono">{formatCents(totals.vat10)}</span>
              </div>
            )}
            {totals.vat20 > 0 && (
              <div className="flex justify-between text-[10px] text-[#6b7280]">
                <span>MwSt 20%</span>
                <span className="font-mono">{formatCents(totals.vat20)}</span>
              </div>
            )}
          </div>

          {/* Grand total */}
          <div className="flex justify-between items-baseline">
            <span className="text-sm font-semibold text-white">Gesamt</span>
            <span className="text-xl font-bold text-[#00e87a] font-mono tracking-tight">
              {formatCents(totals.gross)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
