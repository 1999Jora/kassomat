import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { Tenant, TenantSettings, Category } from '@kassomat/types';
import api from '../lib/api';

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

type Tab = 'general' | 'atrust' | 'lieferando' | 'wix' | 'mypos' | 'printer' | 'categories';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'general', label: 'Allgemein' },
  { id: 'atrust', label: 'A-Trust' },
  { id: 'lieferando', label: 'Lieferando' },
  { id: 'wix', label: 'Wix' },
  { id: 'mypos', label: 'myPOS' },
  { id: 'printer', label: 'Drucker' },
  { id: 'categories', label: 'Kategorien' },
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
      vatNumber: vatNumber || null,
      receiptFooter: receiptFooter || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Firmenname">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mein Betrieb" />
      </Field>

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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
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
        {activeTab === 'lieferando' && <LieferandoTab settings={tenant.settings} />}
        {activeTab === 'wix' && <WixTab settings={tenant.settings} />}
        {activeTab === 'mypos' && <MyPOSTab settings={tenant.settings} />}
        {activeTab === 'printer' && <PrinterTab settings={tenant.settings} />}
        {activeTab === 'categories' && <CategoriesTab />}
      </div>
    </div>
  );
}

