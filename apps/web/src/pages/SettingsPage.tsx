import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { Tenant, TenantSettings, Category, Product } from '@kassomat/types';
import api, { createNullReceipt, createTrainingReceipt, createStartReceipt, createClosingReceipt, getPrintMode, setPrintMode, waitForRksvSignature, printReceiptById, getDigitalReceiptUrl, type PrintMode } from '../lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full bg-[#080a0c] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm',
        'placeholder:text-white/30 focus:outline-none focus:border-[#00e87a]/60 focus:ring-1 focus:ring-[#00e87a]/20',
        'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        props.className,
      )}
    />
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/70 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

function SaveButton({ loading, disabled }: { loading: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="bg-[#00e87a] text-[#080a0c] font-semibold px-6 py-2.5 rounded-lg text-sm hover:bg-[#00d46e] transition-colors disabled:opacity-50 flex items-center gap-2"
    >
      {loading && (
        <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      Speichern
    </button>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative w-11 h-6 rounded-full transition-colors focus:outline-none',
          checked ? 'bg-[#00e87a]' : 'bg-white/10',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
      <span className="text-sm text-white/60">{checked ? labelOn : labelOff}</span>
    </div>
  );
}

// ─── Tab types ────────────────────────────────────────────────────────────────

type Tab = 'general' | 'atrust' | 'fiskaltrust' | 'lieferando' | 'wix' | 'mypos' | 'printer' | 'bon-layout' | 'categories' | 'articles';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'Allgemein' },
  { id: 'atrust', label: 'A-Trust' },
  { id: 'fiskaltrust', label: 'fiskaltrust' },
  { id: 'lieferando', label: 'Lieferando' },
  { id: 'wix', label: 'Wix' },
  { id: 'mypos', label: 'myPOS' },
  { id: 'printer', label: 'Drucker' },
  { id: 'bon-layout', label: 'Bon-Layout' },
  { id: 'categories', label: 'Kategorien' },
  { id: 'articles', label: 'Artikel / MwSt' },
];

// ─── API response type ────────────────────────────────────────────────────────

interface TenantResponse {
  success: true;
  data: Tenant;
}

// ─── General tab ─────────────────────────────────────────────────────────────

function GeneralTab({ tenant }: { tenant: Tenant }) {
  const qc = useQueryClient();
  const [name, setName] = useState(tenant.name);
  const [address, setAddress] = useState(tenant.settings.address ?? '');
  const [city, setCity] = useState(tenant.settings.city ?? '');
  const [vatNumber, setVatNumber] = useState(tenant.settings.vatNumber ?? '');
  const [receiptFooter, setReceiptFooter] = useState(tenant.settings.receiptFooter ?? '');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('Einstellungen gespeichert');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name,
      address: address || null,
      city: city || null,
      vatNumber: vatNumber || null,
      receiptFooter: receiptFooter || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Firmenname">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mein Betrieb" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Straße & Hausnummer">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Musterstraße 1"
          />
        </Field>
        <Field label="PLZ & Ort">
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="6020 Innsbruck"
          />
        </Field>
      </div>

      <Field label="UID-Nummer" hint="Österreichische Umsatzsteuer-ID (z.B. ATU12345678)">
        <Input
          value={vatNumber}
          onChange={(e) => setVatNumber(e.target.value)}
          placeholder="ATU12345678"
        />
      </Field>

      <Field label="Bon-Fußzeile" hint="Wird auf jeden Kassenbon gedruckt">
        <Input
          value={receiptFooter}
          onChange={(e) => setReceiptFooter(e.target.value)}
          placeholder="Vielen Dank für Ihren Besuch!"
        />
      </Field>

      <div className="pt-2">
        <SaveButton loading={mutation.isPending} />
      </div>
    </form>
  );
}

// ─── RKSV Sonderbeleg-Buttons ─────────────────────────────────────────────────

function RksvSonderbelegeSection() {
  const [loading, setLoading] = useState<string | null>(null);
  const [closingId, setClosingId] = useState('KASSE-01');

  async function handle(type: 'null' | 'training' | 'start' | 'closing') {
    setLoading(type);
    const mode = getPrintMode();
    // Popup-Blocker-Fix: Fenster VOR async öffnen
    const pdfWindow = mode === 'pdf' ? window.open('about:blank', '_blank', 'noopener') : null;
    try {
      let receipt;
      if (type === 'null') receipt = await createNullReceipt();
      else if (type === 'training') receipt = await createTrainingReceipt();
      else if (type === 'start') receipt = await createStartReceipt(closingId);
      else receipt = await createClosingReceipt(closingId);

      const labels: Record<string, string> = {
        null: 'Nullbeleg', training: 'Trainingsbeleg',
        start: 'Startbeleg', closing: 'Schlussbeleg',
      };
      toast.success(`${labels[type]} erstellt`);

      await waitForRksvSignature(receipt.id);

      if (mode === 'printer') {
        await printReceiptById(receipt.id);
      } else if (mode === 'pdf' && pdfWindow) {
        pdfWindow.location.href = getDigitalReceiptUrl(receipt.id);
      }
    } catch {
      if (pdfWindow) pdfWindow.close();
      toast.error('Fehler beim Erstellen des Belegs');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">RKSV Sonderbelege</p>

      <div className="grid grid-cols-1 gap-2">
        {/* Startbeleg */}
        <div className="bg-[#080a0c] border border-[#00e87a]/20 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Startbeleg</p>
              <p className="text-xs text-white/40">Kasse in Betrieb nehmen — erster Beleg bei Inbetriebnahme</p>
            </div>
            <button
              type="button"
              onClick={() => handle('start')}
              disabled={loading !== null}
              className="text-xs bg-[#00e87a]/10 hover:bg-[#00e87a]/20 text-[#00e87a] border border-[#00e87a]/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {loading === 'start' ? '...' : 'Erstellen'}
            </button>
          </div>
          <input
            value={closingId}
            onChange={(e) => setClosingId(e.target.value)}
            className="w-full bg-black/30 border border-white/[0.06] rounded px-2.5 py-1.5 text-xs text-white/60 focus:outline-none focus:border-[#00e87a]/30"
            placeholder="Kassen-ID (z.B. KASSE-01)"
          />
        </div>

        {/* Nullbeleg */}
        <div className="flex items-center justify-between bg-[#080a0c] border border-white/[0.06] rounded-lg px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white/80">Nullbeleg</p>
            <p className="text-xs text-white/40">Signaturketten-Test, €0 Umsatz</p>
          </div>
          <button
            type="button"
            onClick={() => handle('null')}
            disabled={loading !== null}
            className="text-xs bg-white/[0.06] hover:bg-white/10 text-white/70 border border-white/[0.08] px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading === 'null' ? '...' : 'Erstellen'}
          </button>
        </div>

        {/* Trainingsbeleg */}
        <div className="flex items-center justify-between bg-[#080a0c] border border-white/[0.06] rounded-lg px-4 py-3">
          <div>
            <p className="text-sm font-medium text-white/80">Trainingsbeleg</p>
            <p className="text-xs text-white/40">Schulungsmodus — TRA-Marker, kein Umsatzeffekt</p>
          </div>
          <button
            type="button"
            onClick={() => handle('training')}
            disabled={loading !== null}
            className="text-xs bg-[#00e87a]/10 hover:bg-[#00e87a]/20 text-[#00e87a] border border-[#00e87a]/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading === 'training' ? '...' : 'Erstellen'}
          </button>
        </div>

        {/* Schlussbeleg */}
        <div className="bg-[#080a0c] border border-red-500/20 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Schlussbeleg</p>
              <p className="text-xs text-red-400/60">Kasse außer Betrieb — bei FinanzOnline einreichen</p>
            </div>
            <button
              type="button"
              onClick={() => handle('closing')}
              disabled={loading !== null}
              className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
            >
              {loading === 'closing' ? '...' : 'Erstellen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── A-Trust tab ──────────────────────────────────────────────────────────────

function ATrustTab({ settings }: { settings: TenantSettings }) {
  const qc = useQueryClient();
  const atrust = settings.atrust;

  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<'test' | 'production'>(
    atrust?.environment ?? 'test',
  );

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('A-Trust Einstellungen gespeichert');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error('Bitte API-Schlüssel eingeben');
      return;
    }
    mutation.mutate({
      atrust: {
        apiKey,
        environment,
        certificateSerial: atrust?.certificateSerial ?? '',
      },
    });
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#080a0c] border border-white/5 rounded-xl p-4 text-sm text-white/50">
        <p className="font-medium text-white/70 mb-1">Was ist A-Trust?</p>
        <p>
          A-Trust stellt qualifizierte Signaturen für die österreichische
          Registrierkassensicherheitsverordnung (RKSV) bereit. Alle Bons werden mit Ihrem
          Signaturzertifikat digital signiert.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="A-Trust API-Schlüssel" hint="Erhalten Sie von A-Trust nach Zertifikatsregistrierung">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="••••••••••••••••"
            autoComplete="off"
          />
          {atrust?.apiKeyHint && !apiKey && (
            <p className="mt-1 text-xs text-[#00e87a]/70">KEY hinterlegt: {atrust.apiKeyHint}</p>
          )}
        </Field>

        <Field label="Umgebung">
          <Toggle
            checked={environment === 'production'}
            onChange={(v) => setEnvironment(v ? 'production' : 'test')}
            labelOn="Produktion (Live)"
            labelOff="Testumgebung"
          />
        </Field>

        {atrust?.certificateSerial && (
          <Field label="Zertifikats-Seriennummer">
            <Input value={atrust.certificateSerial} disabled />
          </Field>
        )}

        <div className="pt-2 flex gap-3">
          <SaveButton loading={mutation.isPending} />
          <button
            type="button"
            disabled
            title="Zertifikatsregistrierung muss über das A-Trust Portal erfolgen"
            className="bg-white/5 border border-white/10 text-white/30 font-medium px-6 py-2.5 rounded-lg text-sm cursor-not-allowed"
          >
            Registrieren (A-Trust Portal)
          </button>
        </div>
      </form>

      <div className="border-t border-white/[0.06] pt-5">
        <RksvSonderbelegeSection />
      </div>
    </div>
  );
}

// ─── fiskaltrust tab ──────────────────────────────────────────────────────────

function FiskaltrustTab({ settings }: { settings: TenantSettings }) {
  const qc = useQueryClient();
  const ft = settings.fiskaltrust;

  const [cashboxId, setCashboxId] = useState(ft?.cashboxId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>(ft?.environment ?? 'sandbox');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('fiskaltrust Einstellungen gespeichert');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cashboxId.trim()) {
      toast.error('Bitte CashBox ID eingeben');
      return;
    }
    mutation.mutate({
      fiskaltrust: {
        cashboxId,
        ...(accessToken ? { accessToken } : {}),
        environment,
      },
    });
  }

  function handleDisconnect() {
    mutation.mutate({ fiskaltrust: null });
    setCashboxId('');
    setAccessToken('');
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#080a0c] border border-white/5 rounded-xl p-4 text-sm text-white/50 space-y-2">
        <p className="font-medium text-white/70">Was ist fiskaltrust?</p>
        <p>
          fiskaltrust bietet einen kostenlosen RKSV-Signatur-Sandbox-Dienst für Demo- und
          Testzwecke. Ideal für die Entwicklung ohne A-Trust Vertrag.
        </p>
        <p>
          Registrierung:{' '}
          <span className="text-white/60 font-mono text-xs">portal-sandbox.fiskaltrust.at</span>
          {' '}→ CashBox anlegen → CashBox ID + Access Token kopieren.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="CashBox ID" hint="Aus dem fiskaltrust Portal (Sandbox oder Produktion)">
          <Input
            value={cashboxId}
            onChange={(e) => setCashboxId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            autoComplete="off"
          />
        </Field>

        <Field label="Access Token" hint="Aus dem fiskaltrust Portal — leer lassen um bestehenden zu behalten">
          <Input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="••••••••••••••••"
            autoComplete="off"
          />
          {ft?.accessTokenHint && !accessToken && (
            <p className="mt-1 text-xs text-[#00e87a]/70">Token hinterlegt: {ft.accessTokenHint}</p>
          )}
        </Field>

        <Field label="Umgebung">
          <Toggle
            checked={environment === 'production'}
            onChange={(v) => setEnvironment(v ? 'production' : 'sandbox')}
            labelOn="Produktion"
            labelOff="Sandbox (Demo)"
          />
        </Field>

        <div className="pt-2 flex gap-3">
          <SaveButton loading={mutation.isPending} />
          {ft && (
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={mutation.isPending}
              className="border border-red-500/30 text-red-400 font-medium px-6 py-2.5 rounded-lg text-sm hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              Trennen
            </button>
          )}
        </div>
      </form>

      {ft?.configured && (
        <div className="bg-[#00e87a]/5 border border-[#00e87a]/20 rounded-xl p-4 text-sm">
          <p className="text-[#00e87a] font-medium mb-1">fiskaltrust aktiv</p>
          <p className="text-white/50">
            Bons werden über fiskaltrust ({environment}) signiert. A-Trust hat Vorrang falls konfiguriert.
          </p>
        </div>
      )}

      <div className="border-t border-white/[0.06] pt-5">
        <RksvSonderbelegeSection />
      </div>
    </div>
  );
}

// ─── Lieferando tab ───────────────────────────────────────────────────────────

function LieferandoTab({ settings }: { settings: TenantSettings }) {
  const qc = useQueryClient();
  const lieferando = settings.lieferando;

  const [apiKey, setApiKey] = useState('');
  const [restaurantId, setRestaurantId] = useState(lieferando?.restaurantId ?? '');
  const [isActive, setIsActive] = useState(lieferando?.isActive ?? false);

  const WEBHOOK_URL = 'https://api.kassomat.at/webhooks/lieferando';

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('Lieferando Einstellungen gespeichert');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!lieferando?.configured && !apiKey.trim()) {
      toast.error('Bitte Lieferando API-Schlüssel eingeben');
      return;
    }
    const payload: Record<string, unknown> = { restaurantId, isActive };
    if (apiKey.trim()) payload['apiKey'] = apiKey.trim();
    mutation.mutate({ lieferando: payload });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Integration aktiviert">
        <Toggle
          checked={isActive}
          onChange={setIsActive}
          labelOn="Aktiv"
          labelOff="Inaktiv"
        />
      </Field>

      <Field label="API-Schlüssel" hint="Aus Ihrem Lieferando Partner-Portal">
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="••••••••••••••••"
          autoComplete="off"
        />
        {lieferando?.apiKeyHint && !apiKey && (
          <p className="mt-1 text-xs text-[#00e87a]/70">KEY hinterlegt: {lieferando.apiKeyHint}</p>
        )}
      </Field>

      <Field label="Restaurant-ID">
        <Input
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          placeholder="z.B. 123456"
        />
      </Field>

      <Field
        label="Webhook-URL"
        hint="Tragen Sie diese URL in Ihrem Lieferando Partner-Portal ein"
      >
        <div className="flex gap-2">
          <Input value={WEBHOOK_URL} readOnly className="bg-[#080a0c]/50 text-white/50 cursor-default" />
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(WEBHOOK_URL).then(
                () => toast.success('URL kopiert'),
                () => toast.error('Kopieren fehlgeschlagen'),
              );
            }}
            className="flex-shrink-0 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors text-xs"
          >
            Kopieren
          </button>
        </div>
      </Field>

      <div className="pt-2">
        <SaveButton loading={mutation.isPending} />
      </div>
    </form>
  );
}

// ─── Wix tab ──────────────────────────────────────────────────────────────────

function WixTab({ settings }: { settings: TenantSettings }) {
  const qc = useQueryClient();
  const wix = settings.wix;

  const [apiKey, setApiKey] = useState('');
  const [siteId, setSiteId] = useState(wix?.siteId ?? '');
  const [isActive, setIsActive] = useState(wix?.isActive ?? false);
  const [defaultDelivery, setDefaultDelivery] = useState<'cash' | 'online'>(
    wix?.defaultDeliveryPayment ?? 'online',
  );

  const syncMutation = useMutation({
    mutationFn: () => api.post('/wix/sync-products'),
    onSuccess: (res) => {
      const d = (res.data as { data: { created: number; updated: number; deleted: number } }).data;
      toast.success(`Sync abgeschlossen: ${d.created} neu, ${d.updated} aktualisiert, ${d.deleted} gelöscht`);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Sync fehlgeschlagen';
      toast.error(msg);
    },
  });

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('Wix Einstellungen gespeichert');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wix?.configured && !apiKey.trim()) {
      toast.error('Bitte Wix API-Schlüssel eingeben');
      return;
    }
    const payload: Record<string, unknown> = { siteId, isActive, defaultDeliveryPayment: defaultDelivery };
    if (apiKey.trim()) payload['apiKey'] = apiKey.trim();
    mutation.mutate({ wix: payload });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {wix?.configured && (
        <div className="bg-[#00e87a]/5 border border-[#00e87a]/20 rounded-xl p-3 text-sm text-[#00e87a] flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          Wix ist konfiguriert. API-Schlüssel ist gespeichert.
        </div>
      )}

      <Field label="Integration aktiviert">
        <Toggle
          checked={isActive}
          onChange={setIsActive}
          labelOn="Aktiv"
          labelOff="Inaktiv"
        />
      </Field>

      <Field label="Wix API-Schlüssel" hint={wix?.configured ? 'Leer lassen, um den bestehenden Schlüssel zu behalten' : 'Aus Ihrem Wix Dashboard unter Einstellungen > API-Schlüssel'}>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={wix?.configured ? '••••••••••••••••' : 'API-Schlüssel eingeben'}
          autoComplete="off"
        />
        {wix?.apiKeyHint && !apiKey && (
          <p className="mt-1 text-xs text-[#00e87a]/70">KEY hinterlegt: {wix.apiKeyHint}</p>
        )}
      </Field>

      <Field label="Wix Site-ID">
        <Input
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
      </Field>

      <Field label="Standard-Zahlungsart für Lieferungen">
        <div className="flex gap-3">
          {(['cash', 'online'] as const).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setDefaultDelivery(method)}
              className={clsx(
                'flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                defaultDelivery === method
                  ? 'border-[#00e87a] bg-[#00e87a]/10 text-[#00e87a]'
                  : 'border-white/10 text-white/50 hover:text-white/70',
              )}
            >
              {method === 'cash' ? 'Barzahlung' : 'Online-Zahlung'}
            </button>
          ))}
        </div>
      </Field>

      <div className="pt-2 flex gap-3">
        <SaveButton loading={mutation.isPending} />
        {wix?.configured && (
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !isActive}
            className="bg-white/5 border border-white/10 text-white/70 font-medium px-6 py-2.5 rounded-lg text-sm hover:bg-white/10 transition-colors disabled:opacity-50 flex items-center gap-2"
            title={!isActive ? 'Integration muss aktiviert sein' : 'Artikel jetzt von Wix importieren'}
          >
            {syncMutation.isPending && (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            Jetzt synchronisieren
          </button>
        )}
      </div>
    </form>
  );
}

// ─── myPOS tab ────────────────────────────────────────────────────────────────

function MyPOSTab({ settings }: { settings: TenantSettings }) {
  const qc = useQueryClient();
  const mypos = settings.mypos;

  const [storeId, setStoreId] = useState(mypos?.storeId ?? '');
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [terminalSerial, setTerminalSerial] = useState(mypos?.terminalSerial ?? '');

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('myPOS Einstellungen gespeichert');
      setApiKey('');
      setSecretKey('');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!storeId.trim()) {
      toast.error('Bitte Store-ID eingeben');
      return;
    }

    if (!mypos?.configured && (!apiKey.trim() || !secretKey.trim())) {
      toast.error('API-Key und Secret-Key sind erforderlich');
      return;
    }

    const finalMypos: Record<string, string | null | undefined> = {
      storeId: storeId.trim(),
      terminalSerial: terminalSerial.trim() || null,
    };
    if (apiKey.trim()) finalMypos['apiKey'] = apiKey.trim();
    if (secretKey.trim()) finalMypos['secretKey'] = secretKey.trim();

    mutation.mutate({ mypos: finalMypos });
  }

  return (
    <div className="space-y-5">
      <div className="bg-[#080a0c] border border-white/5 rounded-xl p-4 text-sm text-white/50">
        <p className="font-medium text-white/70 mb-1">Was ist myPOS?</p>
        <p>
          myPOS stellt Kartenzahlungs-Terminals bereit. Über die myPOS Cloud API
          wird die Zahlung direkt vom Kassensystem auf das Terminal geschickt.
          Kunden zahlen kontaktlos oder mit Karte am Terminal.
        </p>
      </div>

      {mypos?.configured && (
        <div className="bg-[#00e87a]/5 border border-[#00e87a]/20 rounded-xl p-3 text-sm text-[#00e87a] flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          myPOS ist konfiguriert. API-Key und Secret-Key sind gespeichert.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Store-ID" hint="Ihre myPOS Store-ID aus dem myPOS Business Portal">
          <Input
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            placeholder="z.B. 12345"
          />
        </Field>

        <Field
          label="API-Key"
          hint={mypos?.configured ? 'Leer lassen, um den bestehenden Key zu behalten' : 'Aus Ihrem myPOS Business Portal'}
        >
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={mypos?.configured ? '••••••••••••••••' : 'API-Key eingeben'}
            autoComplete="off"
          />
          {mypos?.apiKeyHint && !apiKey && (
            <p className="mt-1 text-xs text-[#00e87a]/70">KEY hinterlegt: {mypos.apiKeyHint}</p>
          )}
        </Field>

        <Field
          label="Secret-Key (IPN)"
          hint={mypos?.configured ? 'Leer lassen, um den bestehenden Key zu behalten' : 'Webhook-Secret aus dem myPOS Portal für IPN-Signatur-Verifikation'}
        >
          <Input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={mypos?.configured ? '••••••••••••••••' : 'Secret-Key eingeben'}
            autoComplete="off"
          />
        </Field>

        <Field
          label="Terminal-Seriennummer (optional)"
          hint="Wenn mehrere Terminals vorhanden: Seriennummer des gewünschten Terminals. Leer = Standard-Terminal."
        >
          <Input
            value={terminalSerial}
            onChange={(e) => setTerminalSerial(e.target.value)}
            placeholder="z.B. 12345678"
          />
        </Field>

        <Field label="Webhook-URL (IPN)" hint="Diese URL im myPOS Portal als Callback-URL hinterlegen">
          <div className="flex gap-2">
            <Input
              value="https://api.kassomat.at/webhooks/mypos"
              readOnly
              className="bg-[#080a0c]/50 text-white/50 cursor-default"
            />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('https://api.kassomat.at/webhooks/mypos').then(
                  () => toast.success('URL kopiert'),
                  () => toast.error('Kopieren fehlgeschlagen'),
                );
              }}
              className="flex-shrink-0 px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white/80 hover:bg-white/10 transition-colors text-xs"
            >
              Kopieren
            </button>
          </div>
        </Field>

        <div className="pt-2">
          <SaveButton loading={mutation.isPending} />
        </div>
      </form>
    </div>
  );
}

// ─── Printer tab ──────────────────────────────────────────────────────────────

function PrinterTab({ settings }: { settings: TenantSettings }) {
  const qc = useQueryClient();

  type PrinterType = 'USB' | 'Network' | 'File';
  const [printerType, setPrinterType] = useState<PrinterType>(
    settings.printerIp ? 'Network' : 'USB',
  );
  const [host, setHost] = useState(settings.printerIp ?? '');
  const [port, setPort] = useState(settings.printerPort?.toString() ?? '9100');
  const [printMode, setPrintModeState] = useState<PrintMode>(getPrintMode());

  function handlePrintModeChange(mode: PrintMode) {
    setPrintModeState(mode);
    setPrintMode(mode);
    toast.success('Druckmodus gespeichert');
  }

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch('/tenant', body),
    onSuccess: () => {
      toast.success('Drucker-Einstellungen gespeichert');
      void qc.invalidateQueries({ queryKey: ['tenant'] });
    },
    onError: () => toast.error('Fehler beim Speichern'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      printerIp: printerType === 'Network' ? host || null : null,
      printerPort: printerType === 'Network' ? (parseInt(port, 10) || 9100) : null,
    });
  }

  const printerTypes: PrinterType[] = ['USB', 'Network', 'File'];
  const printerTypeLabels: Record<PrinterType, string> = {
    USB: 'USB (lokal)',
    Network: 'Netzwerk (IP)',
    File: 'Datei (Test)',
  };

  const printModes: { id: PrintMode; label: string; desc: string }[] = [
    { id: 'printer', label: 'Bondrucker', desc: 'ESC/POS an konfigurierten Drucker senden' },
    { id: 'pdf', label: 'PDF / Browser', desc: 'Digitalen Bon im Browser-Tab öffnen' },
    { id: 'none', label: 'Kein Druck', desc: 'Nur Bon erstellen, nicht drucken' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Print mode */}
      <Field label="Druckmodus nach Bon-Erstellung">
        <div className="space-y-2 mt-1">
          {printModes.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => handlePrintModeChange(m.id)}
              className={clsx(
                'w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors',
                printMode === m.id
                  ? 'border-[#00e87a] bg-[#00e87a]/10'
                  : 'border-white/10 bg-[#080a0c] hover:border-white/20',
              )}
            >
              <span className={clsx(
                'mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                printMode === m.id ? 'border-[#00e87a]' : 'border-white/30',
              )}>
                {printMode === m.id && <span className="w-2 h-2 rounded-full bg-[#00e87a]" />}
              </span>
              <div>
                <p className={clsx('text-sm font-medium', printMode === m.id ? 'text-[#00e87a]' : 'text-white/80')}>{m.label}</p>
                <p className="text-xs text-white/40 mt-0.5">{m.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </Field>

      <div className="border-t border-white/[0.06] pt-5" />

      <Field label="Druckertyp">
        <div className="flex gap-2">
          {printerTypes.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPrinterType(t)}
              className={clsx(
                'flex-1 py-2.5 rounded-lg text-sm font-medium border transition-colors',
                printerType === t
                  ? 'border-[#00e87a] bg-[#00e87a]/10 text-[#00e87a]'
                  : 'border-white/10 text-white/50 hover:text-white/70',
              )}
            >
              {printerTypeLabels[t]}
            </button>
          ))}
        </div>
      </Field>

      {printerType === 'Network' && (
        <>
          <Field label="Host / IP-Adresse">
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.100"
            />
          </Field>

          <Field label="Port">
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="9100"
              type="number"
              min={1}
              max={65535}
            />
          </Field>
        </>
      )}

      {printerType === 'USB' && (
        <div className="bg-[#080a0c] border border-white/5 rounded-xl p-4 text-sm text-white/50">
          USB-Drucker werden automatisch erkannt. Stellen Sie sicher, dass der Drucker am
          Kassensystem angeschlossen ist.
        </div>
      )}

      {printerType === 'File' && (
        <div className="bg-[#080a0c] border border-white/5 rounded-xl p-4 text-sm text-white/50">
          Im Datei-Modus werden Bons als PDF/Text-Dateien gespeichert. Nur für
          Testumgebungen geeignet.
        </div>
      )}

      <div className="pt-2">
        <SaveButton loading={mutation.isPending} />
      </div>
    </form>
  );
}

// ─── Categories tab ───────────────────────────────────────────────────────────

function CategoryRow({
  category,
  onUpdate,
}: {
  category: Category;
  onUpdate: (id: string, data: Partial<Pick<Category, 'name' | 'color'>>) => void;
}) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);

  function handleColorChange(newColor: string) {
    setColor(newColor);
    onUpdate(category.id, { color: newColor });
  }

  function handleNameBlur() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== category.name) {
      onUpdate(category.id, { name: trimmed });
    }
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.03] border border-white/5">
      <div className="relative w-8 h-8 shrink-0">
        <div
          className="w-8 h-8 rounded-lg cursor-pointer border border-white/10 hover:border-white/30 transition-colors"
          style={{ backgroundColor: color }}
          onClick={() => document.getElementById('color-' + category.id)?.click()}
        />
        <input
          id={'color-' + category.id}
          type="color"
          value={color}
          onChange={(e) => handleColorChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleNameBlur}
        className="flex-1 bg-transparent border-b border-transparent hover:border-white/20 focus:border-[#00e87a]/60 text-white text-sm py-1 focus:outline-none transition-colors"
      />
      <span className="text-[10px] font-mono text-white/30 w-16 text-right">{color}</span>
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#3B82F6');

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: Category[] }>('/categories');
      return data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Pick<Category, 'name' | 'color'>> }) =>
      api.patch('/categories/' + id, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: () => toast.error('Fehler beim Speichern'),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; color: string; sortOrder: number }) =>
      api.post('/categories', body),
    onSuccess: () => {
      toast.success('Kategorie erstellt');
      setNewName('');
      setNewColor('#3B82F6');
      void qc.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: () => toast.error('Fehler beim Erstellen'),
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const maxOrder = categories.length > 0 ? Math.max(...categories.map((c) => c.sortOrder)) + 1 : 0;
    createMutation.mutate({ name: newName.trim(), color: newColor, sortOrder: maxOrder });
  }

  if (isLoading) {
    return <div className="text-white/40 text-sm py-4 text-center">Laden…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        {categories.map((cat) => (
          <CategoryRow
            key={cat.id}
            category={cat}
            onUpdate={(id, data) => updateMutation.mutate({ id, data })}
          />
        ))}
        {categories.length === 0 && (
          <p className="text-white/40 text-sm py-4 text-center">Keine Kategorien vorhanden</p>
        )}
      </div>

      <div className="border-t border-white/5 pt-5">
        <p className="text-white/70 text-sm font-medium mb-3">Neue Kategorie</p>
        <form onSubmit={handleCreate} className="flex gap-3 items-end">
          <div className="flex-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Kategoriename"
            />
          </div>
          <div className="relative w-10 h-10 shrink-0">
            <div
              className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer"
              style={{ backgroundColor: newColor }}
              onClick={() => document.getElementById('new-cat-color')?.click()}
            />
            <input
              id="new-cat-color"
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </div>
          <button
            type="submit"
            disabled={!newName.trim() || createMutation.isPending}
            className="bg-[#00e87a] text-[#080a0c] font-semibold px-4 py-2.5 rounded-lg text-sm hover:bg-[#00d46e] disabled:opacity-50 transition-colors shrink-0"
          >
            Hinzufügen
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Articles tab ─────────────────────────────────────────────────────────────

const VAT_OPTIONS: Array<{ value: 0 | 10 | 13 | 20; label: string }> = [
  { value: 0, label: '0%' },
  { value: 10, label: '10%' },
  { value: 13, label: '13%' },
  { value: 20, label: '20%' },
];

/**
 * Infer Austrian VAT rate (MwSt) from product name + category name.
 *
 * Rules (§ 10 UStG):
 *  13% — Wein/Sekt/Prosecco (Weinbauerzeugnisse)
 *  20% — Bier, Spirituosen, Tabak, Standardsatz
 *  10% — Lebensmittel, alkoholfreie Getränke, Kaffee, Tee
 */
function inferAustrianVatRate(productName: string, categoryName: string): 0 | 10 | 13 | 20 {
  const text = (productName + ' ' + categoryName).toLowerCase();

  // 13 %: Wein, Sekt, Prosecco, Champagner, Cava, Crémant (Weinbauerzeugnisse § 10 Abs. 3 Z 3)
  const wine13 = ['wein', 'sekt', 'prosecco', 'champagner', 'champagne', 'cava', 'crémant', 'cremant', 'frizzante', 'spumante', 'grappa'];
  if (wine13.some((k) => text.includes(k))) return 13;

  // 20 %: Bier & Spirituosen (Alkohol außer Wein)
  const alcohol20 = [
    'bier', 'pils', 'pilsner', 'lager', 'weizen', 'weißbier', 'dunkel', 'märzen', 'radler', 'shandy',
    'schnaps', 'schnapps', 'vodka', 'wodka', 'rum', 'gin', 'whiskey', 'whisky', 'tequila', 'mezcal',
    'brandy', 'cognac', 'likör', 'likoer', 'aperol', 'campari', 'sambuca', 'baileys', 'absinth',
    'shots', 'shot', 'spirituosen', 'hochprozent', 'destillat', 'obstbrand',
    'tabak', 'zigarett', 'zigarre', 'shisha',
  ];
  if (alcohol20.some((k) => text.includes(k))) return 20;

  // 10 %: Lebensmittel & alkoholfreie Getränke (§ 10 Abs. 2 Z 1)
  const food10 = [
    // Speisen / food
    'speise', 'speisen', 'essen', 'food', 'snack', 'gericht', 'menü', 'menu', 'mahlzeit',
    'frühstück', 'mittagessen', 'abendessen', 'jause', 'brotzeit',
    'suppe', 'salat', 'vorspeise', 'hauptspeise', 'nachspeise', 'dessert', 'beilage',
    'pizza', 'pasta', 'nudel', 'burger', 'sandwich', 'wrap', 'toast', 'brot', 'gebäck', 'semmel',
    'kuchen', 'torte', 'strudel', 'mehlspeise', 'süßspeise', 'palatschinke', 'waffel',
    'schnitzel', 'fleisch', 'fisch', 'meeresfrüchte', 'geflügel', 'wurst', 'schinken',
    'gemüse', 'vegetarisch', 'vegan', 'käse', 'ei', 'omelette',
    'pommes', 'kartoffel', 'reis', 'knödel', 'spätzle',
    'kebab', 'döner', 'falafel', 'sushi', 'ramen',
    // alkoholfreie Getränke
    'wasser', 'mineral', 'mineralwasser', 'sodawasser', 'leitungswasser',
    'saft', 'juice', 'orangensaft', 'apfelsaft', 'fruchtsaft',
    'kaffee', 'coffee', 'espresso', 'cappuccino', 'latte', 'macchiato',
    'melange', 'verlängerter', 'brauner', 'schwarzer', 'einspänner', 'franziskaner',
    'tee', 'tea', 'eistee', 'iced tea',
    'cola', 'pepsi', 'limonade', 'limo', 'fanta', 'sprite', 'almdudler', 'zitronade',
    'energy drink', 'energydrink', 'red bull', 'monster',
    'smoothie', 'milchshake', 'shake', 'milch', 'kakao', 'hot chocolate', 'schokolade',
    'nestea', 'eistee', 'fruchtsaft', 'nektar',
    // Kategorienamen
    'getränk', 'getränke', 'drinks', 'beverages', 'alkoholfrei', 'soft drink', 'softdrink',
    'kalt getränk', 'warm getränk', 'heißgetränk', 'kaltgetränk',
  ];
  if (food10.some((k) => text.includes(k))) return 10;

  // Default: 20 % Normalsatz
  return 20;
}

function numericVatRate(vatRate: number | string): 0 | 10 | 13 | 20 {
  if (typeof vatRate === 'string') {
    return parseInt((vatRate as string).replace('VAT_', ''), 10) as 0 | 10 | 13 | 20;
  }
  return vatRate as 0 | 10 | 13 | 20;
}

function ArticlesTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [autoAssigning, setAutoAssigning] = useState(false);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products-all'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: { items: Product[] } }>(
        '/products?pageSize=200',
      );
      return data.data.items;
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data } = await api.get<{ success: true; data: Category[] }>('/categories');
      return data.data;
    },
  });

  const vatMutation = useMutation({
    mutationFn: ({ id, vatRate }: { id: string; vatRate: 0 | 10 | 13 | 20 }) =>
      api.patch('/products/' + id, { vatRate }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products-all'] }),
    onError: () => toast.error('Fehler beim Speichern'),
  });

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  async function handleAutoAssign() {
    if (products.length === 0) return;
    setAutoAssigning(true);
    let changed = 0;
    try {
      for (const product of products) {
        const catName = categoryMap.get(product.categoryId)?.name ?? '';
        const suggested = inferAustrianVatRate(product.name, catName);
        const current = numericVatRate(product.vatRate as number | string);
        if (suggested !== current) {
          await api.patch('/products/' + product.id, { vatRate: suggested });
          changed++;
        }
      }
      await qc.invalidateQueries({ queryKey: ['products-all'] });
      toast.success(
        changed > 0
          ? `${changed} Artikel aktualisiert (Ö. Steuerrecht)`
          : 'Alle MwSt-Sätze bereits korrekt',
      );
    } catch {
      toast.error('Fehler bei der automatischen Zuweisung');
    } finally {
      setAutoAssigning(false);
    }
  }

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Group by category
  const grouped = new Map<string, { category: Category | undefined; products: Product[] }>();
  for (const p of filtered) {
    const cat = categoryMap.get(p.categoryId);
    const key = p.categoryId;
    if (!grouped.has(key)) grouped.set(key, { category: cat, products: [] });
    grouped.get(key)!.products.push(p);
  }

  if (isLoading) {
    return <div className="text-white/40 text-sm py-4 text-center">Laden…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-white/70 text-sm font-medium">MwSt-Satz pro Artikel</p>
          <p className="text-white/40 text-xs mt-0.5">Änderungen werden sofort gespeichert</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAutoAssign}
            disabled={autoAssigning || products.length === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#00e87a]/10 text-[#00e87a] border border-[#00e87a]/20 hover:bg-[#00e87a]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {autoAssigning ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Wird zugewiesen…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                </svg>
                Auto-MwSt (Ö. Steuerrecht)
              </>
            )}
          </button>
          <Input
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[160px]"
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-white/40 bg-white/[0.02] rounded-lg px-3 py-2 border border-white/5">
        <span><span className="text-yellow-400 font-semibold">13%</span> Wein, Sekt, Prosecco</span>
        <span>·</span>
        <span><span className="text-red-400 font-semibold">20%</span> Bier, Spirituosen, Standard</span>
        <span>·</span>
        <span><span className="text-[#00e87a] font-semibold">10%</span> Speisen, alkoholfreie Getränke</span>
      </div>

      {Array.from(grouped.entries()).map(([catId, { category, products: catProducts }]) => (
        <div key={catId}>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 flex items-center gap-2">
            {category && (
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
            )}
            {category?.name ?? 'Ohne Kategorie'}
            <span className="text-white/20 normal-case font-normal">({catProducts.length})</span>
          </p>
          <div className="space-y-1">
            {catProducts.map((product) => {
              const current = numericVatRate(product.vatRate as number | string);
              const catName = categoryMap.get(product.categoryId)?.name ?? '';
              const suggested = inferAustrianVatRate(product.name, catName);
              const mismatch = suggested !== current;
              return (
                <div
                  key={product.id}
                  className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                    mismatch
                      ? 'bg-yellow-500/5 border-yellow-500/20'
                      : 'bg-white/[0.03] border-white/5'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{product.name}</p>
                    <p className="text-white/30 text-xs font-mono">
                      €{(product.price / 100).toFixed(2).replace('.', ',')}
                      {mismatch && (
                        <span className="ml-2 text-yellow-400">→ {suggested}% empfohlen</span>
                      )}
                    </p>
                  </div>
                  <select
                    value={current}
                    onChange={(e) =>
                      vatMutation.mutate({
                        id: product.id,
                        vatRate: parseInt(e.target.value) as 0 | 10 | 13 | 20,
                      })
                    }
                    className={`bg-[#080a0c] border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#00e87a]/60 transition-colors ${
                      mismatch ? 'border-yellow-500/40 text-yellow-300' : 'border-white/10 text-white'
                    }`}
                  >
                    {VAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        MwSt {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-white/40 text-sm py-4 text-center">Keine Artikel gefunden</p>
      )}
    </div>
  );
}

// ─── Bon-Layout tab ──────────────────────────────────────────────────────────

const BON_W = 42;

function bonPad(left: string, right: string, width = BON_W) {
  const gap = width - left.length - right.length;
  return left + (gap > 0 ? ' '.repeat(gap) : ' ') + right;
}
function bonCenter(text: string, width = BON_W) {
  const gap = width - text.length;
  if (gap <= 0) return text;
  return ' '.repeat(Math.floor(gap / 2)) + text;
}
function bonDivider(char = '-', width = BON_W) {
  return char.repeat(width);
}
function bonFmtEuro(cents: number) {
  const e = Math.floor(Math.abs(cents) / 100);
  const c = Math.abs(cents) % 100;
  return `${cents < 0 ? '-' : ''}€${e},${String(c).padStart(2, '0')}`;
}
function bonFmtDate() {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

const BON_MOCK_ITEMS = [
  { name: 'Coca Cola 0,5l', qty: 2, price: 299, vat: 20 },
  { name: 'Red Bull 0,25l', qty: 1, price: 249, vat: 20 },
  { name: 'Chips Paprika', qty: 1, price: 199, vat: 10 },
  { name: 'Manner Schnitten', qty: 3, price: 149, vat: 10 },
];

interface BonLine { text: string; bold?: boolean; big?: boolean; center?: boolean }

function BonPreview({ lines }: { lines: BonLine[] }) {
  return (
    <div className="bg-white text-black rounded shadow-lg overflow-hidden inline-block">
      <div className="px-4 py-5 font-mono text-[11px] leading-[1.6] whitespace-pre" style={{ width: `${BON_W * 7.2 + 32}px` }}>
        {lines.map((line, i) => {
          let text = line.center ? bonCenter(line.text) : line.text;
          if (!text && !line.text) text = '\u00A0';
          return (
            <div key={i} className={line.bold ? 'font-bold' : ''} style={line.big ? { fontSize: '16px', lineHeight: '1.8' } : undefined}>
              {text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BonLayoutTab({ tenant }: { tenant: Tenant }) {
  const qc = useQueryClient();
  const [bonTab, setBonTab] = useState<'rechnung' | 'lieferbon'>('rechnung');
  const [uploading, setUploading] = useState(false);

  // Rechnung config
  const tenantName = tenant.name;
  const address = tenant.settings.address ?? '';
  const city = tenant.settings.city ?? '';
  const vatNumber = tenant.settings.vatNumber ?? '';
  const footer = tenant.settings.receiptFooter ?? 'Danke fuer Ihren Besuch!';
  const logoBase64 = tenant.settings.logoBase64 ?? null;

  // Lieferbon config — load from localStorage
  const savedLiefer = useMemo(() => {
    try {
      const raw = localStorage.getItem('kassomat_lieferbon_config');
      return raw ? JSON.parse(raw) as Record<string, unknown> : null;
    } catch { return null; }
  }, []);
  const [lieferTitle, setLieferTitle] = useState((savedLiefer?.title as string) ?? 'LIEFERBON');
  const [showTenantOnLiefer, setShowTenantOnLiefer] = useState((savedLiefer?.showTenant as boolean) ?? true);
  const [showAddress, setShowAddress] = useState((savedLiefer?.showAddress as boolean) ?? true);
  const [showPrices, setShowPrices] = useState((savedLiefer?.showPrices as boolean) ?? true);
  const [lieferSaved, setLieferSaved] = useState(false);

  function saveLieferbonConfig() {
    localStorage.setItem('kassomat_lieferbon_config', JSON.stringify({
      title: lieferTitle,
      showTenant: showTenantOnLiefer,
      showAddress,
      showPrices,
    }));
    setLieferSaved(true);
    toast.success('Lieferbon-Einstellungen gespeichert');
    setTimeout(() => setLieferSaved(false), 2000);
  }

  // Logo upload
  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post('/tenant/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await qc.invalidateQueries({ queryKey: ['tenant'] });
      toast.success('Logo hochgeladen');
    } catch {
      toast.error('Logo-Upload fehlgeschlagen (max 500KB, PNG/JPG/WebP)');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleLogoDelete() {
    try {
      await api.delete('/tenant/logo');
      await qc.invalidateQueries({ queryKey: ['tenant'] });
      toast.success('Logo entfernt');
    } catch {
      toast.error('Fehler beim Entfernen des Logos');
    }
  }

  const items = BON_MOCK_ITEMS;
  const totalGross = items.reduce((s, i) => s + i.price * i.qty, 0);
  const vat20 = items.filter(i => i.vat === 20).reduce((s, i) => s + Math.round(i.price * i.qty * 20 / 120), 0);
  const vat10 = items.filter(i => i.vat === 10).reduce((s, i) => s + Math.round(i.price * i.qty * 10 / 110), 0);
  const totalNet = totalGross - vat20 - vat10;

  // Build Rechnung lines
  const rechnungLines: BonLine[] = [];
  if (logoBase64) rechnungLines.push({ text: '[ LOGO ]', center: true, bold: true });
  rechnungLines.push({ text: tenantName, bold: true, big: true, center: true });
  if (address) rechnungLines.push({ text: address, center: true });
  if (city) rechnungLines.push({ text: city, center: true });
  if (vatNumber) rechnungLines.push({ text: `UID: ${vatNumber}`, center: true });
  rechnungLines.push({ text: '' });
  rechnungLines.push({ text: bonPad('Bon-Nr.:', '2026-000042') });
  rechnungLines.push({ text: bonPad('Kasse:', 'KASSE-01') });
  rechnungLines.push({ text: bonPad('Datum:', bonFmtDate()) });
  rechnungLines.push({ text: bonPad('Kassierer:', 'Max M.') });
  rechnungLines.push({ text: bonPad('Belegnr.:', '2026-000042') });
  rechnungLines.push({ text: bonPad('RK-ID:', 'KASSE-01') });
  rechnungLines.push({ text: bonDivider() });
  for (const item of items) {
    rechnungLines.push({ text: bonPad(item.name, bonFmtEuro(item.price * item.qty)) });
    rechnungLines.push({ text: bonPad(`  ${item.qty}x ${bonFmtEuro(item.price)}`, `MwSt ${item.vat}%`) });
  }
  rechnungLines.push({ text: bonDivider() });
  rechnungLines.push({ text: bonPad('Netto:', bonFmtEuro(totalNet)) });
  if (vat10 > 0) rechnungLines.push({ text: bonPad('MwSt 10%:', bonFmtEuro(vat10)) });
  if (vat20 > 0) rechnungLines.push({ text: bonPad('MwSt 20%:', bonFmtEuro(vat20)) });
  rechnungLines.push({ text: bonPad('GESAMT:', bonFmtEuro(totalGross)), bold: true });
  rechnungLines.push({ text: bonDivider() });
  rechnungLines.push({ text: bonPad('Zahlungsart:', 'Bargeld') });
  rechnungLines.push({ text: bonPad('Bezahlt:', bonFmtEuro(2000)) });
  rechnungLines.push({ text: bonPad('Wechselgeld:', bonFmtEuro(2000 - totalGross)) });
  // RKSV QR-Code ist Pflicht — immer anzeigen
  rechnungLines.push({ text: '' });
  rechnungLines.push({ text: 'RKSV-Signatur', center: true });
  rechnungLines.push({ text: '[  QR-CODE  ]', center: true, bold: true });
  rechnungLines.push({ text: '' });
  rechnungLines.push({ text: bonDivider() });
  rechnungLines.push({ text: footer, center: true });

  // Build Lieferbon lines
  const lieferbonLines: BonLine[] = [];
  lieferbonLines.push({ text: '*** KEINE RECHNUNG ***', bold: true, center: true });
  lieferbonLines.push({ text: lieferTitle, bold: true, big: true, center: true });
  if (showTenantOnLiefer) lieferbonLines.push({ text: tenantName, bold: true, center: true });
  lieferbonLines.push({ text: bonDivider('=') });
  lieferbonLines.push({ text: `Datum: ${bonFmtDate()}` });
  lieferbonLines.push({ text: '' });
  if (showAddress) {
    lieferbonLines.push({ text: bonDivider('-') });
    lieferbonLines.push({ text: 'LIEFERADRESSE:', bold: true });
    lieferbonLines.push({ text: '  Max Mustermann', bold: true });
    lieferbonLines.push({ text: '  Testgasse 1/3' });
    lieferbonLines.push({ text: '  6020 Innsbruck' });
    lieferbonLines.push({ text: '' });
  }
  lieferbonLines.push({ text: bonDivider('=') });
  for (const item of items) {
    if (showPrices) {
      lieferbonLines.push({ text: bonPad(`${item.qty}x ${item.name}`, bonFmtEuro(item.price * item.qty)) });
    } else {
      lieferbonLines.push({ text: `${item.qty}x ${item.name}` });
    }
  }
  if (showPrices) {
    lieferbonLines.push({ text: bonDivider('=') });
    lieferbonLines.push({ text: bonPad('GESAMT', bonFmtEuro(totalGross)), bold: true });
  }
  lieferbonLines.push({ text: bonDivider('=') });
  lieferbonLines.push({ text: '*** KEINE RECHNUNG ***', bold: true, center: true });

  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-1">Bon-Layout</h2>
      <p className="text-white/40 text-sm mb-4">Vorschau wie Rechnung und Lieferbon auf dem 80mm Bondrucker aussehen (42 Zeichen, Monospace, s/w).</p>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-[#080a0c] border border-white/5 rounded-lg p-0.5 mb-6 w-fit">
        <button
          type="button"
          onClick={() => setBonTab('rechnung')}
          className={clsx('px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
            bonTab === 'rechnung' ? 'bg-[#00e87a]/10 text-[#00e87a]' : 'text-white/50 hover:text-white/80'
          )}
        >
          Rechnung
        </button>
        <button
          type="button"
          onClick={() => setBonTab('lieferbon')}
          className={clsx('px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
            bonTab === 'lieferbon' ? 'bg-[#00e87a]/10 text-[#00e87a]' : 'text-white/50 hover:text-white/80'
          )}
        >
          Lieferbon
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Config */}
        <div className="w-full xl:w-64 space-y-4 shrink-0">
          {bonTab === 'rechnung' ? (
            <>
              <p className="text-xs text-white/40">Firmenname, Adresse und UID werden unter &quot;Allgemein&quot; konfiguriert.</p>
              {/* Logo Upload */}
              <div className="space-y-2">
                <label className="text-xs text-white/60 font-medium">Logo</label>
                {logoBase64 ? (
                  <div className="flex items-center gap-3">
                    <img src={logoBase64} alt="Logo" className="h-10 w-10 object-contain rounded bg-white/5 p-0.5" />
                    <button type="button" onClick={handleLogoDelete} className="text-xs text-red-400 hover:text-red-300">Entfernen</button>
                  </div>
                ) : (
                  <p className="text-[10px] text-white/30">Kein Logo hochgeladen</p>
                )}
                <label className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors', uploading ? 'bg-white/5 text-white/30' : 'bg-white/10 text-white/70 hover:bg-white/15')}>
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} disabled={uploading} className="hidden" />
                  {uploading ? 'Lädt...' : 'Logo hochladen'}
                </label>
                <p className="text-[10px] text-white/20">Max 500KB, PNG/JPG/WebP</p>
              </div>
              <div className="text-[10px] text-white/30 space-y-0.5 pt-2 border-t border-white/5">
                <p>QR-Code ist RKSV-Pflicht (immer aktiv)</p>
                <p>80mm Papier = 42 Zeichen</p>
                <p>Nur schwarz/weiss, Monospace</p>
              </div>
            </>
          ) : (
            <>
              <Field label="Titel">
                <Input value={lieferTitle} onChange={(e) => setLieferTitle(e.target.value)} />
              </Field>
              <div className="space-y-3">
                <Toggle checked={showTenantOnLiefer} onChange={setShowTenantOnLiefer} labelOn="Firmenname ein" labelOff="Firmenname aus" />
                <Toggle checked={showAddress} onChange={setShowAddress} labelOn="Adresse ein" labelOff="Adresse aus" />
                <Toggle checked={showPrices} onChange={setShowPrices} labelOn="Preise ein" labelOff="Preise aus" />
              </div>
              <button
                type="button"
                onClick={saveLieferbonConfig}
                className={clsx('w-full py-2 rounded-lg text-sm font-semibold transition-colors', lieferSaved ? 'bg-[#00e87a]/20 text-[#00e87a]' : 'bg-[#00e87a] text-black hover:bg-[#00e87a]/90')}
              >
                {lieferSaved ? 'Gespeichert' : 'Speichern'}
              </button>
              <div className="text-[10px] text-white/30 space-y-0.5 pt-2 border-t border-white/5">
                <p>Kein RKSV QR-Code</p>
                <p>&quot;KEINE RECHNUNG&quot; oben + unten</p>
                <p>Nur fuer interne Lieferzwecke</p>
              </div>
            </>
          )}
        </div>

        {/* Preview */}
        <div className="flex-1 flex justify-center bg-[#080a0c] rounded-xl border border-white/5 p-6 overflow-x-auto">
          <BonPreview lines={bonTab === 'rechnung' ? rechnungLines : lieferbonLines} />
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const { data: tenant, isLoading } = useQuery<Tenant>({
    queryKey: ['tenant'],
    queryFn: async () => {
      const { data } = await api.get<TenantResponse>('/tenant');
      return data.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <svg className="animate-spin w-6 h-6 text-[#00e87a]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-white/40 text-sm py-8 text-center">
        Einstellungen konnten nicht geladen werden.
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-white font-bold text-2xl mb-8">Einstellungen</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0e1115] border border-white/5 rounded-xl p-1 mb-8 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-[#00e87a]/10 text-[#00e87a]'
                : 'text-white/50 hover:text-white/80',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-[#0e1115] border border-white/5 rounded-xl p-6">
        {activeTab === 'general' && <GeneralTab tenant={tenant} />}
        {activeTab === 'atrust' && <ATrustTab settings={tenant.settings} />}
        {activeTab === 'fiskaltrust' && <FiskaltrustTab settings={tenant.settings} />}
        {activeTab === 'lieferando' && <LieferandoTab settings={tenant.settings} />}
        {activeTab === 'wix' && <WixTab settings={tenant.settings} />}
        {activeTab === 'mypos' && <MyPOSTab settings={tenant.settings} />}
        {activeTab === 'printer' && <PrinterTab settings={tenant.settings} />}
        {activeTab === 'bon-layout' && <BonLayoutTab tenant={tenant} />}
        {activeTab === 'categories' && <CategoriesTab />}
        {activeTab === 'articles' && <ArticlesTab />}
      </div>
    </div>
  );
}

