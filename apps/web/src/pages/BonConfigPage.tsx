import { useState } from 'react';

// ── Mock-Daten ────────────────────────────────────────────────────────────────

const MOCK_ITEMS = [
  { name: 'Coca Cola 0,5l', qty: 2, price: 299, vat: 20 },
  { name: 'Red Bull 0,25l', qty: 1, price: 249, vat: 20 },
  { name: 'Chips Paprika', qty: 1, price: 199, vat: 10 },
  { name: 'Manner Schnitten', qty: 3, price: 149, vat: 10 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const W = 42; // Bondrucker: 42 Zeichen bei 80mm

function fmtEuro(cents: number) {
  const e = Math.floor(Math.abs(cents) / 100);
  const c = Math.abs(cents) % 100;
  return `${cents < 0 ? '-' : ''}€${e},${String(c).padStart(2, '0')}`;
}

function pad(left: string, right: string, width = W) {
  const gap = width - left.length - right.length;
  return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right;
}

function center(text: string, width = W) {
  const gap = width - text.length;
  if (gap <= 0) return text;
  const left = Math.floor(gap / 2);
  return ' '.repeat(left) + text;
}

function divider(char = '-', width = W) {
  return char.repeat(width);
}

function fmtDate() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

// ── Rechnung (ESC/POS Stil) ───────────────────────────────────────────────────

interface RechnungConfig {
  tenantName: string;
  address: string;
  city: string;
  vatNumber: string;
  footerText: string;
  showQrCode: boolean;
  isDemoSignature: boolean;
}

function RechnungPreview({ config }: { config: RechnungConfig }) {
  const items = MOCK_ITEMS;
  const totalGross = items.reduce((s, i) => s + i.price * i.qty, 0);
  const vat20 = items.filter(i => i.vat === 20).reduce((s, i) => s + Math.round(i.price * i.qty * 20 / 120), 0);
  const vat10 = items.filter(i => i.vat === 10).reduce((s, i) => s + Math.round(i.price * i.qty * 10 / 110), 0);
  const totalNet = totalGross - vat20 - vat10;
  const amountPaid = 2000;
  const change = amountPaid - totalGross;

  const lines: Array<{ text: string; bold?: boolean; big?: boolean; center?: boolean }> = [];

  // Header
  lines.push({ text: config.tenantName, bold: true, big: true, center: true });
  if (config.address) lines.push({ text: config.address, center: true });
  if (config.city) lines.push({ text: config.city, center: true });
  if (config.vatNumber) lines.push({ text: `UID: ${config.vatNumber}`, center: true });
  lines.push({ text: '' });

  // Meta
  lines.push({ text: pad('Bon-Nr.:', '2026-000042') });
  lines.push({ text: pad('Kasse:', 'KASSE-01') });
  lines.push({ text: pad('Datum:', fmtDate()) });
  lines.push({ text: pad('Kassierer:', 'Max M.') });
  lines.push({ text: pad('Belegnr.:', '2026-000042') });
  lines.push({ text: pad('RK-ID:', 'KASSE-01') });
  lines.push({ text: divider() });

  // Items
  for (const item of items) {
    lines.push({ text: pad(item.name, fmtEuro(item.price * item.qty)) });
    lines.push({ text: pad(`  ${item.qty}x ${fmtEuro(item.price)}`, `MwSt ${item.vat}%`) });
  }
  lines.push({ text: divider() });

  // Totals
  lines.push({ text: pad('Netto:', fmtEuro(totalNet)) });
  if (vat10 > 0) lines.push({ text: pad('MwSt 10%:', fmtEuro(vat10)) });
  if (vat20 > 0) lines.push({ text: pad('MwSt 20%:', fmtEuro(vat20)) });
  lines.push({ text: pad('GESAMT:', fmtEuro(totalGross)), bold: true });
  lines.push({ text: divider() });

  // Payment
  lines.push({ text: pad('Zahlungsart:', 'Bargeld') });
  lines.push({ text: pad('Bezahlt:', fmtEuro(amountPaid)) });
  if (change > 0) lines.push({ text: pad('Wechselgeld:', fmtEuro(change)) });

  // RKSV QR
  if (config.showQrCode) {
    lines.push({ text: '' });
    lines.push({ text: 'RKSV-Signatur', center: true });
    lines.push({ text: '[  QR-CODE  ]', center: true, bold: true });
    lines.push({ text: '' });
  }

  lines.push({ text: divider() });

  // Footer
  lines.push({ text: config.footerText, center: true });

  // Demo
  if (config.isDemoSignature) {
    lines.push({ text: '' });
    lines.push({ text: '*** DEMO-SIGNATUR ***', center: true, bold: true });
  }

  return (
    <div className="bg-white text-black rounded shadow-lg overflow-hidden inline-block">
      {/* Paper */}
      <div className="px-4 py-5 font-mono text-[11px] leading-[1.6] whitespace-pre" style={{ width: `${W * 7.2 + 32}px` }}>
        {lines.map((line, i) => {
          let text = line.center ? center(line.text) : line.text;
          if (!text && !line.text) text = '\u00A0'; // empty line
          return (
            <div
              key={i}
              className={`${line.bold ? 'font-bold' : ''}`}
              style={line.big ? { fontSize: '16px', lineHeight: '1.8' } : undefined}
            >
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Lieferbon (ESC/POS Stil) ──────────────────────────────────────────────────

interface LieferbonConfig {
  title: string;
  tenantName: string;
  showTenantName: boolean;
  showAddress: boolean;
  showPrices: boolean;
  sampleName: string;
  sampleStreet: string;
  sampleCity: string;
}

function LieferbonPreview({ config }: { config: LieferbonConfig }) {
  const items = MOCK_ITEMS;
  const totalGross = items.reduce((s, i) => s + i.price * i.qty, 0);

  const lines: Array<{ text: string; bold?: boolean; big?: boolean; center?: boolean }> = [];

  // Header
  lines.push({ text: '*** KEINE RECHNUNG ***', bold: true, center: true });
  lines.push({ text: config.title, bold: true, big: true, center: true });
  if (config.showTenantName) lines.push({ text: config.tenantName, bold: true, center: true });
  lines.push({ text: divider('=') });

  // Datum
  lines.push({ text: `Datum: ${fmtDate()}` });
  lines.push({ text: '' });

  // Lieferadresse
  if (config.showAddress) {
    lines.push({ text: divider('-') });
    lines.push({ text: 'LIEFERADRESSE:', bold: true });
    lines.push({ text: `  ${config.sampleName}`, bold: true });
    lines.push({ text: `  ${config.sampleStreet}` });
    lines.push({ text: `  ${config.sampleCity}` });
    lines.push({ text: '' });
  }

  // Artikel
  lines.push({ text: divider('=') });
  for (const item of items) {
    if (config.showPrices) {
      lines.push({ text: pad(`${item.qty}x ${item.name}`, fmtEuro(item.price * item.qty)) });
    } else {
      lines.push({ text: `${item.qty}x ${item.name}` });
    }
  }

  // Gesamt
  if (config.showPrices) {
    lines.push({ text: divider('=') });
    lines.push({ text: pad('GESAMT', fmtEuro(totalGross)), bold: true });
  }

  lines.push({ text: divider('=') });
  lines.push({ text: '*** KEINE RECHNUNG ***', bold: true, center: true });

  return (
    <div className="bg-white text-black rounded shadow-lg overflow-hidden inline-block">
      <div className="px-4 py-5 font-mono text-[11px] leading-[1.6] whitespace-pre" style={{ width: `${W * 7.2 + 32}px` }}>
        {lines.map((line, i) => {
          let text = line.center ? center(line.text) : line.text;
          if (!text && !line.text) text = '\u00A0';
          return (
            <div
              key={i}
              className={`${line.bold ? 'font-bold' : ''}`}
              style={line.big ? { fontSize: '16px', lineHeight: '1.8' } : undefined}
            >
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

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
    footerText: 'Danke fuer Ihren Besuch!',
    showQrCode: true,
    isDemoSignature: true,
  });

  const [lieferbonCfg, setLieferbonCfg] = useState<LieferbonConfig>({
    title: 'LIEFERBON',
    tenantName: 'Spaetii Innsbruck',
    showTenantName: true,
    showAddress: true,
    showPrices: true,
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
          <span className="text-[10px] text-[#6b7280] bg-white/[0.04] px-2 py-0.5 rounded font-mono">80mm / 42 Zeichen</span>
        </div>
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

      {/* Content */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-53px)]">
        {/* Config */}
        <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-white/[0.06] overflow-y-auto scrollbar-none p-4 space-y-3 shrink-0">
          {tab === 'rechnung' ? (
            <>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">Kopfzeile</p>
              <InputField label="Firmenname" value={rechnungCfg.tenantName} onChange={(v) => updateR({ tenantName: v })} />
              <InputField label="Adresse" value={rechnungCfg.address} onChange={(v) => updateR({ address: v })} />
              <InputField label="PLZ + Ort" value={rechnungCfg.city} onChange={(v) => updateR({ city: v })} />
              <InputField label="UID-Nummer" value={rechnungCfg.vatNumber} onChange={(v) => updateR({ vatNumber: v })} />
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold pt-2">Fusszeile</p>
              <InputField label="Footer Text" value={rechnungCfg.footerText} onChange={(v) => updateR({ footerText: v })} />
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold pt-2">RKSV</p>
              <div className="space-y-3">
                <Toggle label="QR-Code anzeigen" value={rechnungCfg.showQrCode} onChange={(v) => updateR({ showQrCode: v })} />
                <Toggle label="Demo-Signatur" value={rechnungCfg.isDemoSignature} onChange={(v) => updateR({ isDemoSignature: v })} />
              </div>
              <div className="pt-3 text-[10px] text-[#6b7280] space-y-1 border-t border-white/[0.06]">
                <p className="font-bold">Bondrucker-Info:</p>
                <p>80mm Papier = 42 Zeichen</p>
                <p>Nur schwarz/weiss</p>
                <p>Monospace-Schrift (Courier)</p>
                <p>Formatierung: fett, doppelt gross, Ausrichtung</p>
                <p>QR-Code via ESC/POS Befehl</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold">Kopfzeile</p>
              <InputField label="Titel" value={lieferbonCfg.title} onChange={(v) => updateL({ title: v })} />
              <InputField label="Firmenname" value={lieferbonCfg.tenantName} onChange={(v) => updateL({ tenantName: v })} />
              <div className="space-y-3 pt-2">
                <Toggle label="Firmenname anzeigen" value={lieferbonCfg.showTenantName} onChange={(v) => updateL({ showTenantName: v })} />
                <Toggle label="Lieferadresse" value={lieferbonCfg.showAddress} onChange={(v) => updateL({ showAddress: v })} />
                <Toggle label="Preise anzeigen" value={lieferbonCfg.showPrices} onChange={(v) => updateL({ showPrices: v })} />
              </div>
              {lieferbonCfg.showAddress && (
                <>
                  <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-bold pt-2">Beispiel-Adresse</p>
                  <InputField label="Name" value={lieferbonCfg.sampleName} onChange={(v) => updateL({ sampleName: v })} />
                  <InputField label="Strasse" value={lieferbonCfg.sampleStreet} onChange={(v) => updateL({ sampleStreet: v })} />
                  <InputField label="PLZ + Ort" value={lieferbonCfg.sampleCity} onChange={(v) => updateL({ sampleCity: v })} />
                </>
              )}
              <div className="pt-3 text-[10px] text-[#6b7280] space-y-1 border-t border-white/[0.06]">
                <p className="font-bold">Lieferbon-Info:</p>
                <p>Kein RKSV QR-Code</p>
                <p>"KEINE RECHNUNG" oben + unten</p>
                <p>Nur fuer interne Lieferzwecke</p>
              </div>
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
