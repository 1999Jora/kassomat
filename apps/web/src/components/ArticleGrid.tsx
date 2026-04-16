import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { formatCents } from '../lib/formatters';
import { fetchProducts, fetchCategories } from '../lib/api';
import { playKeyClick } from '../lib/sounds';
import type { Product, Category } from '@kassomat/types';

// ── Favorites storage ────────────────────────────────────────────────────────

const FAVORITES_KEY = 'kassomat_favorites';

function getFavoriteIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function toggleFavorite(productId: string): string[] {
  const ids = getFavoriteIds();
  const next = ids.includes(productId)
    ? ids.filter((id) => id !== productId)
    : [...ids, productId];
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  return next;
}

// ── Custom item modal ────────────────────────────────────────────────────────

function CustomItemModal({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, price: number, vatRate: 0 | 10 | 13 | 20) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [priceStr, setPriceStr] = useState('');
  const [vatRate, setVatRate] = useState<0 | 10 | 13 | 20>(20);

  function handleSubmit() {
    const price = Math.round(parseFloat(priceStr.replace(',', '.')) * 100);
    if (!name.trim() || isNaN(price) || price <= 0) return;
    onAdd(name.trim(), price, vatRate);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0e1115] border border-white/[0.08] rounded-2xl p-5 w-[320px] max-w-[90vw] space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-white font-semibold text-sm">Freier Artikel</h3>

        <input
          type="text"
          placeholder="Bezeichnung"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#00e87a]/40"
        />

        <input
          type="text"
          inputMode="decimal"
          placeholder="Preis (z.B. 5,90)"
          value={priceStr}
          onChange={(e) => setPriceStr(e.target.value)}
          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-[#00e87a]/40"
        />

        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1.5">MwSt-Satz</p>
          <div className="grid grid-cols-4 gap-1.5">
            {([20, 10, 13, 0] as const).map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setVatRate(rate)}
                className={`min-h-[36px] rounded-lg text-xs font-medium border transition-all ${
                  vatRate === rate
                    ? 'bg-[#00e87a] text-black border-[#00e87a]'
                    : 'bg-white/[0.05] text-white/50 border-white/[0.06] hover:bg-white/10'
                }`}
              >
                {rate}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl text-sm font-medium bg-white/[0.06] border border-white/[0.08] text-white hover:bg-white/10 transition-colors"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim() || !priceStr.trim()}
            className="flex-1 min-h-[44px] rounded-xl text-sm font-bold bg-[#00e87a] text-black hover:bg-[#00d470] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function CategorySkeleton() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="h-8 w-20 rounded-lg bg-white/[0.07] animate-pulse shrink-0"
        />
      ))}
    </div>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
      {[...Array(12)].map((_, i) => (
        <div
          key={i}
          className="rounded-xl min-h-[100px] bg-white/[0.05] animate-pulse border border-white/[0.04]"
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FAVORITES_CAT = '__favorites__';

export default function ArticleGrid() {
  const { activeCategory, setActiveCategory, addToCart, pluSearch, setPluSearch, setMobileTab } = useAppStore();
  const [favoriteIds, setFavoriteIds] = useState(getFavoriteIds);
  const [showCustomItem, setShowCustomItem] = useState(false);

  // ── Data fetching ────────────────────────────────────────────────────────
  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: fetchProducts,
    retry: 1,
    staleTime: 60_000,
  });

  const {
    data: categories,
    isLoading: categoriesLoading,
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    retry: 1,
    staleTime: 60_000,
  });

  // ── Offline / error fallback ─────────────────────────────────────────────
  const resolvedProducts: Product[] = productsError || !products ? [] : products;
  const resolvedCategories: Category[] = !categories ? [] : categories;

  const isLoading = productsLoading || categoriesLoading;

  // ── Category color map ───────────────────────────────────────────────────
  const categoryColorMap = Object.fromEntries(
    resolvedCategories.map((c) => [c.id, c.color]),
  );

  // ── Favorites ────────────────────────────────────────────────────────────
  const favoriteProducts = resolvedProducts.filter((p) => favoriteIds.includes(p.id));
  const hasFavorites = favoriteProducts.length > 0;

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = resolvedProducts.filter((p) => {
    if (pluSearch.trim()) {
      const q = pluSearch.trim().toLowerCase();
      return (
        p.pluCode?.toLowerCase().startsWith(q) ||
        p.name.toLowerCase().includes(q) ||
        p.barcode?.startsWith(q)
      );
    }
    if (activeCategory === FAVORITES_CAT) return favoriteIds.includes(p.id);
    if (activeCategory) return p.categoryId === activeCategory;
    return true;
  });

  function handleToggleFavorite(e: React.MouseEvent, productId: string) {
    e.stopPropagation();
    setFavoriteIds(toggleFavorite(productId));
  }

  function handleAddCustomItem(name: string, price: number, vatRate: 0 | 10 | 13 | 20) {
    playKeyClick();
    addToCart({
      productId: `custom-${Date.now()}`,
      name,
      price,
      vatRate,
    });
    setMobileTab('cart');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar — prominent at top */}
      <div className="px-3 pt-2.5 pb-2 border-b border-white/[0.06] shrink-0">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={pluSearch}
            onChange={(e) => setPluSearch(e.target.value)}
            placeholder="Suche nach Name, PLU oder Barcode..."
            className="w-full pl-9 pr-20 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-[#00e87a]/40 transition-colors"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {pluSearch && (
              <button
                type="button"
                onClick={() => setPluSearch('')}
                className="p-1 text-white/30 hover:text-white/60 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
            {/* Custom item button */}
            <button
              type="button"
              onClick={() => setShowCustomItem(true)}
              className="p-1.5 rounded-lg bg-white/[0.06] text-white/40 hover:text-[#00e87a] hover:bg-[#00e87a]/10 transition-all"
              title="Freier Artikel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      {isLoading ? (
        <CategorySkeleton />
      ) : (
        <div
          className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none shrink-0 border-b border-white/[0.06]"
          style={{ scrollbarWidth: 'none' }}
        >
          {/* Favoriten tab */}
          {hasFavorites && (
            <button
              type="button"
              onClick={() => setActiveCategory(activeCategory === FAVORITES_CAT ? null : FAVORITES_CAT)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all min-h-[32px] border flex items-center gap-1.5 ${
                activeCategory === FAVORITES_CAT
                  ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 shadow-sm'
                  : 'bg-white/[0.05] text-[#9ca3af] border-white/[0.06] hover:bg-white/10'
              }`}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              Favoriten
              <span className="opacity-50">{favoriteProducts.length}</span>
            </button>
          )}

          {/* Alle */}
          <button
            type="button"
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all min-h-[32px] border ${
              !activeCategory
                ? 'bg-[#00e87a] text-black border-[#00e87a] shadow-sm shadow-[#00e87a]/30'
                : 'bg-white/[0.05] text-[#9ca3af] border-white/[0.06] hover:bg-white/10'
            }`}
          >
            Alle ({resolvedProducts.length})
          </button>
          {resolvedCategories.map((cat) => {
            const count = resolvedProducts.filter((p) => p.categoryId === cat.id).length;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(isActive ? null : cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all min-h-[32px] border ${
                  isActive
                    ? 'text-white shadow-sm'
                    : 'bg-white/[0.05] text-[#9ca3af] border-white/[0.06] hover:bg-white/10'
                }`}
                style={
                  isActive
                    ? {
                        backgroundColor: cat.color + '33',
                        borderColor: cat.color + '66',
                        color: cat.color,
                      }
                    : {}
                }
              >
                {cat.name}
                <span className="ml-1.5 opacity-50">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-3 pt-2.5 pb-2">
        {isLoading ? (
          <ProductGridSkeleton />
        ) : productsError ? (
          <div className="h-48 flex flex-col items-center justify-center text-red-400 gap-2">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-50">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm">Artikel konnten nicht geladen werden</p>
            <p className="text-xs text-white/30">Bitte Verbindung prüfen</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-[#6b7280] gap-2">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="opacity-30"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
            <p className="text-sm">Keine Artikel gefunden</p>
            {pluSearch && (
              <button
                type="button"
                onClick={() => setPluSearch('')}
                className="text-xs text-[#00e87a] hover:underline"
              >
                Suche leeren
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filtered.map((product) => {
              const tileColor = product.color ?? categoryColorMap[product.categoryId] ?? '#6B7280';
              const isFav = favoriteIds.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => {
                    playKeyClick();
                    addToCart({
                      productId: product.id,
                      name: product.name,
                      price: product.price,
                      vatRate: typeof product.vatRate === 'string'
                        ? (parseInt((product.vatRate as string).replace('VAT_', ''), 10) as 0 | 10 | 13 | 20)
                        : product.vatRate,
                    });
                    setMobileTab('cart');
                  }}
                  className="rounded-xl flex flex-col items-start justify-between p-3.5 text-left transition-all duration-100 hover:scale-[1.02] active:scale-[0.97] border min-h-[100px] group relative"
                  style={{
                    backgroundColor: tileColor + '22',
                    borderColor: tileColor + '40',
                  }}
                >
                  {/* Favorite star */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleFavorite(e, product.id)}
                    className={`absolute top-2 right-2 p-1 rounded-md transition-all ${
                      isFav
                        ? 'text-yellow-400 opacity-100'
                        : 'text-white/15 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>

                  <div className="flex-1 w-full pr-5">
                    <p className="text-sm text-white/90 leading-snug font-medium line-clamp-2 group-hover:text-white transition-colors">
                      {product.name}
                    </p>
                  </div>
                  <div className="w-full mt-2">
                    {product.pluCode && (
                      <p className="text-[9px] text-white/30 font-mono mb-0.5">
                        PLU {product.pluCode}
                      </p>
                    )}
                    <div className="flex items-end justify-between">
                      <p className="text-base font-bold text-white">{formatCents(product.price)}</p>
                      <span
                        className="text-[9px] font-mono rounded px-1 py-0.5"
                        style={{ backgroundColor: tileColor + '40', color: tileColor }}
                      >
                        {String(product.vatRate).replace('VAT_', '')}%
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom item modal */}
      {showCustomItem && (
        <CustomItemModal
          onAdd={handleAddCustomItem}
          onClose={() => setShowCustomItem(false)}
        />
      )}
    </div>
  );
}
