import { useState } from 'react';

// ── Mock-Daten ────────────────────────────────────────────────────────────────

const MOCK_ITEMS = [
  { name: 'Coca Cola 0,5l', qty: 2, price: 299, vat: 20 },
  { name: 'Red Bull 0,25l', qty: 1, price: 249, vat: 20 },
  { name: 'Chips Paprika', qty: 1, price: 199, vat: 10 },
  { name: 'Manner Schnitten', qty: 3, price: 149, vat: 10 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEuro(cents: number) {
  const e = Math.floor(Math.abs(cents) / 100);
  const c = Math.abs(cents) % 100;
  return `${cents < 0 ? '-' : ''}€${e},${String(c).padStart(2, '0')}`;
}

function fmtDate() {
  return new Date().toLocaleString('de-AT', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ── Rechnung (HTML-Vorschau im Stil des Digital-Bons) ─────────────────────────

function RechnungPreview({ config }: { config: RechnungConfig }) {
  const items = MOCK_ITEMS;
  const totalGross = items.reduce((s, i) => s + i.price * i.qty, 0);
  const vat20 = items.filter(i => i.vat === 20).reduce((s, i) => {
    const g = i.price * i.qty;
    return s + Math.round(g * 20 / 120);
  }, 0);
  const vat10 = items.filter(i => i.vat === 10).reduce((s, i) => {
    const g = i.price * i.qty;
    return s + Math.round(g * 10 / 110);
  }, 0);
  const totalNet = totalGross - vat20 - vat10;

  return (
    <div className="bg-white text-gray-900 rounded-lg shadow-lg overflow-hidden max-w-[420px] mx-auto text-sm">
      {/* Demo Banner */}
      {config.showDemoBanner && (
        <div className="bg-amber-600 text-white text-center py-1.5 text-[11px] font-bold tracking-wide">
          DEMO-SIGNATUR — Keine rechtsgueltige RKSV-Signatur
        </div>
      )}

      {/* Header */}
      <div style={{ background: config.headerBg, color: config.headerText }} className="px-6 py-5 text-center">
        <h2 className="text-lg font-bold">{config.tenantName}</h2>
        <p className="text-xs mt-1 opacity-70">{config.address}</p>
        <p className="text-xs opacity-70">{config.city}</p>
        {config.vatNumber && <p className="text-[11px] mt-1 opacity-50">UID: {config.vatNumber}</p>}
      </div>

      <div className="px-5">
        {/* Meta */}
        <div className="py-3 border-b border-gray-200 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-gray-500">Bon-Nr.</span><span className="font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-[10px]">2026-000042</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Kasse</span><span>KASSE-01</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Datum</span><span>{fmtDate()}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Kassierer</span><span>Max M.</span></div>
        </div>

        {/* Items */}
        <div className="py-3 border-b border-gray-200">
          {items.map((item, i) => (
            <div key={i} className="flex justify-between py-1">
              <div>
                <span className="font-semibold">{item.name}</span>
                <span className="text-gray-500 ml-2 text-xs">{item.qty}x{fmtEuro(item.price)}</span>
                <span className="text-gray-400 ml-2 text-[10px]">MwSt {item.vat}%</span>
              </div>
              <span className="font-semibold whitespace-nowrap">{fmtEuro(item.price * item.qty)}</span>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="py-3 border-b border-gray-200 text-xs space-y-1">
          <div className="flex justify-between text-gray-500"><span>Netto</span><span>{fmtEuro(totalNet)}</span></div>
          {vat10 > 0 && <div className="flex justify-between text-gray-500"><span>MwSt 10%</span><span>{fmtEuro(vat10)}</span></div>}
          {vat20 > 0 && <div className="flex justify-between text-gray-500"><span>MwSt 20%</span><span>{fmtEuro(vat20)}</span></div>}
          <div className="flex justify-between text-base font-bold border-t-2 border-gray-900 pt-2 mt-2">
            <span>Gesamt</span><span>{fmtEuro(totalGross)}</span>
          </div>
        </div>

        {/* Payment */}
        <div className="py-3 border-b border-gray-200 text-xs space-y-1">
          <div className="flex justify-between text-gray-500"><span>Zahlungsart</span><span className="font-semibold text-gray-900">Bargeld</span></div>
          <div className="flex justify-between text-gray-500"><span>Bezahlt</span><span>{fmtEuro(2000)}</span></div>
          <div className="flex justify-between text-gray-500"><span>Wechselgeld</span><span>{fmtEuro(2000 - totalGross)}</span></div>
        </div>

        {/* RKSV QR */}
        {config.showQrCode && (
          <div className="py-4 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-2">RKSV-Pruefcode</p>
            <div className="inline-block border border-gray-200 rounded p-2 bg-white">
              <div className="w-28 h-28 bg-gray-100 flex items-center justify-center text-gray-400 text-[10px]">
                [QR-Code]
              </div>
            </div>
            <p className="text-[9px] text-gray-300 mt-2 font-mono">_R1-AT0_KASSE-01_2026-000042_...</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-200 px-5 py-4 text-center">
        <p className="text-xs text-gray-500">{config.footerText}</p>
        <p className="text-[10px] text-gray-300 mt-1">Dieser Bon wurde elektronisch erstellt und ist ohne Unterschrift gueltig.</p>
      </div>
    </div>
  );
}

// ── Lieferbon-Vorschau ────────────────────────────────────────────────────────

function LieferbonPreview({ config }: { config: LieferbonConfig }) {
  const items = MOCK_ITEMS;
  const totalGross = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div className="bg-white text-gray-900 rounded-lg shadow-lg overflow-hidden max-w-[340px] mx-auto font-mono text-xs">
      <div className="p-5 space-y-0">
        {/* Header */}
        <div className="text-center space-y-1 pb-3">
          <p className="font-bold text-sm">*** KEINE RECHNUNG ***</p>
          <p className="font-bold text-base">{config.title}</p>
          {config.showTenantName && <p className="font-bold text-xs">{config.tenantName}</p>}
        </div>

        {/* Divider */}
        <div className="text-gray-400 text-[10px] leading-none pb-2">{'='.repeat(46)}</div>

        {/* Datum */}
        <p className="text-[11px] text-gray-600 pb-2">Datum: {fmtDate()}</p>

        {/* Lieferadresse */}
        {config.showAddress && (
          <>
            <div className="text-gray-400 text-[10px] leading-none pb-1">{'-'.repeat(46)}</div>
            <div className="pb-2">
              <p className="text-[10px] font-bold text-gray-600">LIEFERADRESSE:</p>
              <p className="font-bold text-sm pl-1">{config.sampleName}</p>
              <p className="pl-1">{config.sampleStreet}</p>
              <p className="pl-1">{config.sampleCity}</p>
            </div>
          </>
        )}

        {/* Artikel */}
        <div className="text-gray-400 text-[10px] leading-none pb-2">{'='.repeat(46)}</div>
        {items.map((item, i) => (
          <div key={i} className="flex justify-between py-0.5">
            <span>{item.qty}x {item.name}</span>
            <span>{fmtEuro(item.price * item.qty)}</span>
          </div>
        ))}

        {/* Gesamt */}
        <div className="text-gray-400 text-[10px] leading-none py-2">{'='.repeat(46)}</div>
        <div className="flex justify-between font-bold text-sm pb-2">
          <span>GESAMT</span>
          <span>{fmtEuro(totalGross)}</span>
        </div>

        {/* Footer */}
        <div className="text-gray-400 text-[10px] leading-none pb-2">{'='.repeat(46)}</div>
        <p className="text-center font-bold text-[11px]">*** KEINE RECHNUNG ***</p>
      </div>
    </div>
  );
}

// ── Config Types ──────────────────────────────────────────────────────────────

interface RechnungConfig {
  tenantName: string;
  address: string;
  city: string;
  vatNumber: string;
  headerBg: string;
  headerText: string;
  footerText: string;
  showQrCode: boolean;
  showDemoBanner: boolean;
}

interface LieferbonConfig {
  title: string;
  tenantName: string;
  showTenantName: boolean;
  showAddress: boolean;
  sampleName: string;
  sampleStreet: string;
  sampleCity: string;
}

// ── Config Input ──────────────────────────────────────────────────────────────

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-[#6b7280] uppercase tracking-wider block mb-0.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-[#6b7280] outline-none focus:border-[#00e87a]/40 transition-colors"
      />
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-[#6b7280] uppercase tracking-wider block mb-0.5">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-white/[0.08] bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono outline-none focus:border-[#00e87a]/40 transition-colors"
        />
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-xs text-white/70 group-hover:text-white transition-colors">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-9 h-5 rounded-full transition-colors relative ${value ? 'bg-[#00e87a]' : 'bg-white/[0.1]'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────

export default function BonConfigPage() {
  const [tab, setTab] = useState<'rechnung' | 'lieferbon'>('rechnung');

  const [rechnungCfg, setRechnungCfg] = useState<RechnungConfig>({
    tenantName: 'Spaetii Innsbruck',
    address: 'Innrain 42',
    city: '6020 Innsbruck',
    vatNumber: 'ATU12345678',
    headerBg: '#1a202c',
    headerText: '#ffffff',
    footerText: 'Danke fuer Ihren Besuch!',
    showQrCode: true,
    showDemoBanner: true,
  });

  const [lieferbonCfg, setLieferbonCfg] = useState<LieferbonConfig>({
    title: 'LIEFERBON',
    tenantName: 'Spaetii Innsbruck',
    showTenantName: true,
    showAddress: true,
    sampleName: 'Max Mustermann',
    sampleStreet: 'Testgasse 1/3',
    sampleCity: '6020 Innsbruck',
  });

  const updateR = (patch: Partial<RechnungConfig>) => setRechnungCfg((c) => ({ ...c, ...patch }));
  const updateL = (patch: Partial<LieferbonConfig>) => setLieferbonCfg((c) => ({ ...c, ...patch }));

  return (
    <div className="min-h-screen bg-[#080a0c] text-white">
      {/* Top bar */}
      <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/settings" className="text-[#6b7280] hover:text-white transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </a>
          <h1 className="text-sm font-bold">Bon-Konfigurator</h1>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-white/[0.04] rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTab('rechnung')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === 'rechnung' ? 'bg-[#00e87a] text-black' : 'text-[#6b7280] hover:text-white'
            }`}
          >
            Rechnung
          </button>
          <button
            type="button"
            onClick={() => setTab('lieferbon')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
              tab === 'lieferbon' ? 'bg-[#00e87a] text-black' : 'text-[#6b7280] hover:text-white'
            }`}
          >
            Lieferbon
          </button>
        </div>
      </div>

      {/* Content: config left, preview right */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-53px)]">
        {/* Config Panel */}
        <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-white/[0.06] overflow-y-auto scrollbar-none p-4 space-y-4 shrink-0">
          {tab === 'rechnung' ? (
            <>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">Rechnung / Kassenbon</p>
              <InputField label="Firmenname" value={rechnungCfg.tenantName} onChange={(v) => updateR({ tenantName: v })} />
              <InputField label="Adresse" value={rechnungCfg.address} onChange={(v) => updateR({ address: v })} />
              <InputField label="PLZ + Ort" value={rechnungCfg.city} onChange={(v) => updateR({ city: v })} />
              <InputField label="UID-Nummer" value={rechnungCfg.vatNumber} onChange={(v) => updateR({ vatNumber: v })} />
              <ColorField label="Header Hintergrund" value={rechnungCfg.headerBg} onChange={(v) => updateR({ headerBg: v })} />
              <ColorField label="Header Text" value={rechnungCfg.headerText} onChange={(v) => updateR({ headerText: v })} />
              <InputField label="Footer Text" value={rechnungCfg.footerText} onChange={(v) => updateR({ footerText: v })} />
              <div className="space-y-3 pt-2">
                <Toggle label="RKSV QR-Code anzeigen" value={rechnungCfg.showQrCode} onChange={(v) => updateR({ showQrCode: v })} />
                <Toggle label="Demo-Banner anzeigen" value={rechnungCfg.showDemoBanner} onChange={(v) => updateR({ showDemoBanner: v })} />
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">Lieferbon</p>
              <InputField label="Titel" value={lieferbonCfg.title} onChange={(v) => updateL({ title: v })} />
              <InputField label="Firmenname" value={lieferbonCfg.tenantName} onChange={(v) => updateL({ tenantName: v })} />
              <div className="space-y-3 pt-2">
                <Toggle label="Firmenname anzeigen" value={lieferbonCfg.showTenantName} onChange={(v) => updateL({ showTenantName: v })} />
                <Toggle label="Lieferadresse anzeigen" value={lieferbonCfg.showAddress} onChange={(v) => updateL({ showAddress: v })} />
              </div>
              {lieferbonCfg.showAddress && (
                <>
                  <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold pt-2">Beispiel-Adresse</p>
                  <InputField label="Name" value={lieferbonCfg.sampleName} onChange={(v) => updateL({ sampleName: v })} />
                  <InputField label="Strasse" value={lieferbonCfg.sampleStreet} onChange={(v) => updateL({ sampleStreet: v })} />
                  <InputField label="PLZ + Ort" value={lieferbonCfg.sampleCity} onChange={(v) => updateL({ sampleCity: v })} />
                </>
              )}
            </>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-y-auto bg-[#0e1115] p-6 flex items-start justify-center">
          <div className="py-8">
            {tab === 'rechnung' ? (
              <RechnungPreview config={rechnungCfg} />
            ) : (
              <LieferbonPreview config={lieferbonCfg} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
