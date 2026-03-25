import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../store/useAppStore';
import { formatCents } from '../lib/formatters';
import { fetchProducts, fetchCategories } from '../lib/api';
import { MOCK_CATEGORIES, MOCK_PRODUCTS } from '../lib/mockData';
import { playKeyClick } from '../lib/sounds';
import type { Product, Category } from '@kassomat/types';

// ── Loading skeleton ──────────────────────────────────────────────────────────

function CategorySkeleton() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-none shrink-0 border-b border-white/[0.06]">
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
          className="rounded-xl min-h-[88px] bg-white/[0.05] animate-pulse border border-white/[0.04]"
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ArticleGrid() {
  const { activeCategory, setActiveCategory, addToCart, pluSearch, setPluSearch, setMobileTab } = useAppStore();

  // ── Data fetching ────────────────────────────────────────────────────────
  const {
    data: products,
    isLoading: productsLoading,
    isError: productsError,
  } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: fetchProducts,
    // Fall back to mock data on error; stale data is fine for a POS
    retry: 1,
    staleTime: 60_000, // 1 minute
  });

  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
  } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    retry: 1,
    staleTime: 60_000,
  });

  // ── Offline / error fallback to mock data ────────────────────────────────
  const resolvedProducts: Product[] =
    productsError || !products ? MOCK_PRODUCTS : products;
  const resolvedCategories: Category[] =
    categoriesError || !categories ? MOCK_CATEGORIES : categories;

  const isLoading = productsLoading || categoriesLoading;

  // ── Category color map ───────────────────────────────────────────────────
  const categoryColorMap = Object.fromEntries(
    resolvedCategories.map((c) => [c.id, c.color]),
  );

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
    if (activeCategory) return p.categoryId === activeCategory;
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Category tabs */}
      {isLoading ? (
        <CategorySkeleton />
      ) : (
        <div
          className="flex items-center gap-1.5 px-3 py-2.5 overflow-x-auto scrollbar-none shrink-0 border-b border-white/[0.06]"
          style={{ scrollbarWidth: 'none' }}
        >
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered.map((product) => {
              const tileColor = product.color ?? categoryColorMap[product.categoryId] ?? '#6B7280';
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
                  className="rounded-xl flex flex-col items-start justify-between p-3 text-left transition-all duration-100 hover:scale-[1.02] active:scale-[0.97] border min-h-[88px] group"
                  style={{
                    backgroundColor: tileColor + '22',
                    borderColor: tileColor + '40',
                  }}
                >
                  <div className="flex-1 w-full">
                    <p className="text-xs text-white/85 leading-snug font-medium line-clamp-2 group-hover:text-white transition-colors">
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
                      <p className="text-sm font-bold text-white">{formatCents(product.price)}</p>
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

      {/* PLU / search input */}
      <div className="px-3 py-2.5 border-t border-white/[0.06] shrink-0">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none"
            width="13"
            height="13"
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
            placeholder="PLU / Artikelsuche..."
            className="w-full pl-7 pr-8 py-2 bg-white/[0.05] border border-white/[0.08] rounded-lg text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#00e87a]/40 transition-colors"
          />
          {pluSearch && (
            <button
              type="button"
              onClick={() => setPluSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
