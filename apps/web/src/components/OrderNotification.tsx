import { useAppStore } from '../store/useAppStore';
import { formatCents, formatRelative } from '../lib/formatters';
import type { IncomingOrder } from '@kassomat/types';

interface Props {
  onClose: () => void;
}

const SOURCE_CONFIG: Record<
  string,
  { label: string; cls: string; icon: string }
> = {
  lieferando: {
    label: 'Lieferando',
    cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    icon: '🍕',
  },
  wix: {
    label: 'Wix',
    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: '🛒',
  },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Neu', cls: 'text-yellow-400 bg-yellow-400/10' },
  accepted: { label: 'Angenommen', cls: 'text-[#00e87a] bg-[#00e87a]/10' },
  in_progress: { label: 'In Bearbeitung', cls: 'text-blue-400 bg-blue-400/10' },
  completed: { label: 'Fertig', cls: 'text-[#6b7280] bg-white/5' },
  cancelled: { label: 'Storniert', cls: 'text-red-400 bg-red-400/10' },
};

export default function OrderNotification({ onClose }: Props) {
  const { pendingOrders, removePendingOrder, addToCart, clearCart } = useAppStore();

  function loadOrderToCart(order: IncomingOrder) {
    clearCart();
    order.items.forEach((item) => {
      addToCart({
        productId: `ext-${item.externalId}`,
        name: item.name,
        price: item.unitPrice,
        vatRate: 20, // default — real mapping is server-side
      });
    });
    onClose();
  }

  function rejectOrder(id: string) {
    removePendingOrder(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start sm:justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full sm:w-[22rem] sm:m-4 sm:mt-[72px] bg-[#0e1115] border border-white/[0.08] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[82vh] flex flex-col">
        {/* Handle (mobile) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div className="w-8 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[#6b7280]"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span className="text-sm font-semibold">Eingehende Bestellungen</span>
            {pendingOrders.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[#00e87a]/10 text-[#00e87a] text-[10px] font-bold border border-[#00e87a]/20">
                {pendingOrders.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[28px] min-h-[28px] w-7 h-7 rounded-lg bg-white/[0.05] hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {pendingOrders.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-[#6b7280]">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  className="opacity-40"
                >
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <p className="text-sm">Keine offenen Bestellungen</p>
            </div>
          ) : (
            pendingOrders.map((order) => {
              const src = SOURCE_CONFIG[order.source] ?? {
                label: order.source,
                cls: 'bg-white/5 text-white/60 border-white/10',
                icon: '📦',
              };
              const statusCfg =
                STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
              const payIsOnline = order.paymentMethod === 'online_paid';

              return (
                <div
                  key={order.id}
                  className="bg-[#080a0c] rounded-xl border border-white/[0.06] overflow-hidden"
                >
                  {/* Order header */}
                  <div className="px-3 pt-3 pb-2">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${src.cls}`}>
                          {src.icon} {src.label}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusCfg.cls}`}>
                          {statusCfg.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            payIsOnline
                              ? 'bg-[#00e87a]/10 text-[#00e87a]'
                              : 'bg-white/5 text-white/50'
                          }`}
                        >
                          {payIsOnline ? 'Bereits bezahlt' : 'Bar bei Lieferung'}
                        </span>
                      </div>
                      <span className="text-base font-bold text-[#00e87a] font-mono shrink-0">
                        {formatCents(order.totalAmount)}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#6b7280] font-mono">
                      #{order.externalId}{' '}
                      <span className="mx-1 opacity-30">·</span>
                      {formatRelative(new Date(order.receivedAt))}
                    </p>
                  </div>

                  {/* Customer + Delivery Address */}
                  {(order.customer || order.deliveryAddress) && (
                    <div className="px-3 pb-2 space-y-0.5">
                      {order.customer && (
                        <p className="text-xs text-white/60">
                          <span className="text-white/80 font-medium">{order.customer.name}</span>
                          {order.customer.phone && (
                            <span className="text-[#6b7280] ml-1.5">{order.customer.phone}</span>
                          )}
                          {order.customer.email && (
                            <span className="text-[#6b7280] ml-1.5 text-[10px]">{order.customer.email}</span>
                          )}
                        </p>
                      )}
                      {order.deliveryAddress && (
                        <p className="text-[11px] text-[#6b7280]">
                          📍 {order.deliveryAddress.street}, {order.deliveryAddress.zip} {order.deliveryAddress.city}
                          {order.deliveryAddress.notes && (
                            <span className="block ml-4 italic">{order.deliveryAddress.notes}</span>
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Items */}
                  <div className="px-3 pb-2 space-y-0.5 border-t border-white/[0.05] pt-2">
                    {order.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-start text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-white/70">
                            <span className="font-mono text-[#6b7280] mr-1">
                              {item.quantity}×
                            </span>
                            {item.name}
                          </span>
                          {item.options.length > 0 && (
                            <p className="text-[10px] text-[#6b7280] mt-0.5 ml-4">
                              {item.options.join(', ')}
                            </p>
                          )}
                        </div>
                        <span className="text-white/50 font-mono ml-2 shrink-0">
                          {formatCents(item.totalPrice)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {order.notes && (
                    <div className="px-3 pb-2 border-t border-white/[0.05] pt-2">
                      <p className="text-[10px] text-[#6b7280] italic">
                        "{order.notes}"
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  {order.status === 'pending' && (
                    <div className="px-3 pb-3 pt-2 border-t border-white/[0.05] flex gap-2">
                      <button
                        type="button"
                        onClick={() => rejectOrder(order.id)}
                        className="flex-none min-h-[38px] px-3 rounded-lg bg-white/[0.04] hover:bg-red-900/20 hover:text-red-400 text-white/40 text-xs font-medium transition-colors border border-white/[0.06] hover:border-red-900/30"
                      >
                        Ablehnen
                      </button>
                      <button
                        type="button"
                        onClick={() => loadOrderToCart(order)}
                        className="flex-1 min-h-[38px] rounded-lg bg-[#00e87a] hover:bg-[#00d470] active:scale-[0.99] text-black text-xs font-bold transition-all shadow-md shadow-[#00e87a]/15"
                      >
                        In Bon laden
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
