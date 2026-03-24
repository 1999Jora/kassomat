import { useState } from 'react';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import api from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInputValue(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// ─── Info box ─────────────────────────────────────────────────────────────────

function InfoBox() {
  return (
    <div className="bg-[#0e1115] border border-white/5 rounded-xl p-5 mb-8">
      <h3 className="text-white font-medium text-sm mb-3">Was ist das DEP?</h3>
      <div className="space-y-2 text-white/50 text-sm">
        <p>
          Das <strong className="text-white/70">Datenerfassungsprotokoll (DEP)</strong> ist ein
          gesetzlich vorgeschriebenes Protokoll gemäß der österreichischen
          Registrierkassensicherheitsverordnung (RKSV, BGBl. II Nr. 410/2015).
        </p>
        <p>
          Es enthält alle signierten Belege in einer strukturierten JSON-Datei nach
          BMF-Spezifikation. Das DEP muss{' '}
          <strong className="text-white/70">7 Jahre lang aufbewahrt</strong> werden
          (§ 132 BAO) und muss dem Finanzamt auf Anfrage bereitgestellt werden.
        </p>
        <p>
          Der Export enthält alle Bons des gewählten Zeitraums inklusive RKSV-Signaturen,
          Hash-Ketten und Zertifikatsangaben.
        </p>
      </div>
    </div>
  );
}

// ─── Quick date ranges ────────────────────────────────────────────────────────

interface QuickRange {
  label: string;
  from: Date;
  to: Date;
}

function getQuickRanges(): QuickRange[] {
  const today = new Date();
  return [
    { label: 'Letzter Monat', from: subDays(today, 30), to: today },
    { label: 'Letzte 3 Monate', from: subDays(today, 90), to: today },
    { label: 'Letztes Jahr', from: subDays(today, 365), to: today },
  ];
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface DownloadResult {
  url: string;
  filename: string;
}

export default function DepExportPage() {
  const today = new Date();
  const [from, setFrom] = useState(toDateInputValue(subDays(today, 30)));
  const [to, setTo] = useState(toDateInputValue(today));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DownloadResult | null>(null);

  function applyQuickRange(range: QuickRange) {
    setFrom(toDateInputValue(range.from));
    setTo(toDateInputValue(range.to));
    setResult(null);
  }

  async function handleExport(e: React.FormEvent) {
    e.preventDefault();

    if (!from || !to) {
      toast.error('Bitte Zeitraum auswählen');
      return;
    }
    if (new Date(from) > new Date(to)) {
      toast.error('Startdatum muss vor dem Enddatum liegen');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await api.get('/dep/export', {
        params: { from, to },
        responseType: 'blob',
      });

      // Build a download link from the blob response
      const blob = new Blob([response.data as BlobPart], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = `dep-export_${from}_${to}.json`;

      setResult({ url, filename });
      toast.success('DEP-Export erfolgreich erstellt');
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err
      ) {
        const axiosErr = err as { response?: { status?: number } };
        if (axiosErr.response?.status === 404) {
          toast.error('Keine Belege im gewählten Zeitraum gefunden');
        } else {
          toast.error('Export fehlgeschlagen. Bitte versuchen Sie es erneut.');
        }
      } else {
        toast.error('Verbindungsfehler beim Export');
      }
    } finally {
      setLoading(false);
    }
  }

  const quickRanges = getQuickRanges();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-white font-bold text-2xl">DEP Export</h1>
        <p className="text-white/40 text-sm mt-1">
          Datenerfassungsprotokoll nach RKSV exportieren
        </p>
      </div>

      <InfoBox />

      <div className="bg-[#0e1115] border border-white/5 rounded-xl p-6">
        <h2 className="text-white font-medium text-sm mb-5">Zeitraum auswählen</h2>

        {/* Quick ranges */}
        <div className="flex flex-wrap gap-2 mb-6">
          {quickRanges.map((range) => (
            <button
              key={range.label}
              type="button"
              onClick={() => applyQuickRange(range)}
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors"
            >
              {range.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleExport} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Von</label>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setResult(null);
                }}
                max={to}
                required
                className={clsx(
                  'w-full bg-[#080a0c] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm',
                  'focus:outline-none focus:border-[#00e87a]/60 focus:ring-1 focus:ring-[#00e87a]/20',
                  'transition-colors',
                  // Date picker color fix for dark theme
                  '[color-scheme:dark]',
                )}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Bis</label>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setResult(null);
                }}
                min={from}
                max={toDateInputValue(today)}
                required
                className={clsx(
                  'w-full bg-[#080a0c] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm',
                  'focus:outline-none focus:border-[#00e87a]/60 focus:ring-1 focus:ring-[#00e87a]/20',
                  'transition-colors',
                  '[color-scheme:dark]',
                )}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-[#00e87a] text-[#080a0c] font-semibold px-6 py-3 rounded-lg text-sm hover:bg-[#00d46e] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Wird exportiert…
              </>
            ) : (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                DEP exportieren
              </>
            )}
          </button>
        </form>

        {/* Download result */}
        {result && (
          <div className="mt-6 p-4 bg-[#00e87a]/5 border border-[#00e87a]/20 rounded-xl flex items-center gap-4">
            <div className="w-10 h-10 bg-[#00e87a]/10 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#00e87a"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">{result.filename}</p>
              <p className="text-white/40 text-xs mt-0.5">
                Zeitraum: {from} – {to}
              </p>
            </div>
            <a
              href={result.url}
              download={result.filename}
              className="flex-shrink-0 bg-[#00e87a] text-[#080a0c] font-semibold px-4 py-2 rounded-lg text-sm hover:bg-[#00d46e] transition-colors flex items-center gap-2"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Herunterladen
            </a>
          </div>
        )}
      </div>

      {/* Legal notice */}
      <div className="mt-6 px-1">
        <p className="text-white/25 text-xs leading-relaxed">
          Das Datenerfassungsprotokoll unterliegt der 7-jährigen Aufbewahrungspflicht gemäß §&nbsp;132
          BAO. Bewahren Sie alle exportierten DEP-Dateien sicher auf und stellen Sie sicher, dass
          diese im Falle einer Finanzprüfung vollständig vorgelegt werden können.
        </p>
      </div>
    </div>
  );
}
