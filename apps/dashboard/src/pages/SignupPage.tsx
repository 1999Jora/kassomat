import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Step1Data {
  companyName: string;
  vatNumber: string;
  street: string;
  city: string;
  zip: string;
  country: string;
}

interface Step2Data {
  ownerName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type Plan = 'starter' | 'pro' | 'business';

interface Step3Data {
  plan: Plan;
}

// ─── Plan definitions ─────────────────────────────────────────────────────────

const PLANS: Array<{
  id: Plan;
  name: string;
  price: string;
  features: string[];
}> = [
  {
    id: 'starter',
    name: 'Starter',
    price: '€29/Monat',
    features: ['1 Kasse', 'Basis-Analytics', 'RKSV inklusive', 'E-Mail Support'],
  },
  {
    id: 'pro',
    name: 'Professional',
    price: '€79/Monat',
    features: [
      'Bis zu 5 Kassen',
      'Erweiterte Analytics',
      'Lieferando Integration',
      'Wix Integration',
      'Priority Support',
    ],
  },
  {
    id: 'business',
    name: 'Enterprise',
    price: '€199/Monat',
    features: [
      'Unbegrenzte Kassen',
      'Vollständige Analytics',
      'Alle Integrationen',
      'API-Zugang',
      'Dedizierter Support',
      'SLA Garantie',
    ],
  },
];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map((step) => (
        <div key={step} className="flex items-center gap-2">
          <div
            className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors',
              step < current
                ? 'bg-[#00e87a] border-[#00e87a] text-[#080a0c]'
                : step === current
                  ? 'border-[#00e87a] text-[#00e87a]'
                  : 'border-white/20 text-white/30',
            )}
          >
            {step < current ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              step
            )}
          </div>
          {step < total && (
            <div
              className={clsx(
                'h-0.5 w-8 transition-colors',
                step < current ? 'bg-[#00e87a]' : 'bg-white/10',
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-white/70 mb-1.5">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full bg-[#080a0c] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm',
        'placeholder:text-white/30 focus:outline-none focus:border-[#00e87a]/60 focus:ring-1 focus:ring-[#00e87a]/20',
        'transition-colors',
        props.className,
      )}
    />
  );
}

// ─── Step 1: Business info ────────────────────────────────────────────────────

function Step1({
  data,
  onChange,
  onNext,
}: {
  data: Step1Data;
  onChange: (d: Partial<Step1Data>) => void;
  onNext: () => void;
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.companyName.trim()) {
      toast.error('Bitte Firmennamen eingeben');
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Firmenname *">
        <Input
          value={data.companyName}
          onChange={(e) => onChange({ companyName: e.target.value })}
          placeholder="z.B. Spätii Innsbruck GmbH"
          required
          autoFocus
        />
      </Field>

      <Field
        label="UID-Nummer"
        hint="Österreichische Umsatzsteuer-Identifikationsnummer (z.B. ATU12345678)"
      >
        <Input
          value={data.vatNumber}
          onChange={(e) => onChange({ vatNumber: e.target.value })}
          placeholder="ATU12345678"
        />
      </Field>

      <Field label="Straße & Hausnummer">
        <Input
          value={data.street}
          onChange={(e) => onChange({ street: e.target.value })}
          placeholder="Musterstraße 1"
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="PLZ">
          <Input
            value={data.zip}
            onChange={(e) => onChange({ zip: e.target.value })}
            placeholder="1010"
            maxLength={10}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Ort">
            <Input
              value={data.city}
              onChange={(e) => onChange({ city: e.target.value })}
              placeholder="Wien"
            />
          </Field>
        </div>
      </div>

      <Field label="Land">
        <Input
          value={data.country}
          onChange={(e) => onChange({ country: e.target.value })}
          placeholder="Österreich"
        />
      </Field>

      <button
        type="submit"
        className="w-full mt-2 bg-[#00e87a] text-[#080a0c] font-semibold py-3 rounded-lg text-sm hover:bg-[#00d46e] transition-colors"
      >
        Weiter
      </button>
    </form>
  );
}

// ─── Step 2: Owner account ────────────────────────────────────────────────────

function Step2({
  data,
  onChange,
  onNext,
  onBack,
}: {
  data: Step2Data;
  onChange: (d: Partial<Step2Data>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.ownerName.trim()) {
      toast.error('Bitte vollständigen Namen eingeben');
      return;
    }
    if (!data.email.includes('@')) {
      toast.error('Bitte gültige E-Mail-Adresse eingeben');
      return;
    }
    if (data.password.length < 8) {
      toast.error('Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }
    if (data.password !== data.confirmPassword) {
      toast.error('Passwörter stimmen nicht überein');
      return;
    }
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Vollständiger Name *">
        <Input
          value={data.ownerName}
          onChange={(e) => onChange({ ownerName: e.target.value })}
          placeholder="Max Mustermann"
          required
          autoFocus
        />
      </Field>

      <Field label="E-Mail-Adresse *">
        <Input
          type="email"
          value={data.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="max@meinbetrieb.at"
          required
        />
      </Field>

      <Field label="Passwort *" hint="Mindestens 8 Zeichen">
        <Input
          type="password"
          value={data.password}
          onChange={(e) => onChange({ password: e.target.value })}
          placeholder="••••••••"
          required
          minLength={8}
        />
      </Field>

      <Field label="Passwort bestätigen *">
        <Input
          type="password"
          value={data.confirmPassword}
          onChange={(e) => onChange({ confirmPassword: e.target.value })}
          placeholder="••••••••"
          required
        />
      </Field>

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 bg-white/5 border border-white/10 text-white/70 font-semibold py-3 rounded-lg text-sm hover:bg-white/10 transition-colors"
        >
          Zurück
        </button>
        <button
          type="submit"
          className="flex-1 bg-[#00e87a] text-[#080a0c] font-semibold py-3 rounded-lg text-sm hover:bg-[#00d46e] transition-colors"
        >
          Weiter
        </button>
      </div>
    </form>
  );
}

// ─── Step 3: Plan selection ───────────────────────────────────────────────────

function Step3({
  data,
  onChange,
  onSubmit,
  onBack,
  loading,
}: {
  data: Step3Data;
  onChange: (d: Partial<Step3Data>) => void;
  onSubmit: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => onChange({ plan: plan.id })}
            className={clsx(
              'w-full text-left p-4 rounded-xl border-2 transition-all',
              data.plan === plan.id
                ? 'border-[#00e87a] bg-[#00e87a]/5'
                : 'border-white/10 hover:border-white/20 bg-[#080a0c]',
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={clsx(
                  'font-semibold text-sm',
                  data.plan === plan.id ? 'text-[#00e87a]' : 'text-white',
                )}
              >
                {plan.name}
              </span>
              <span
                className={clsx(
                  'text-sm font-bold',
                  data.plan === plan.id ? 'text-[#00e87a]' : 'text-white/60',
                )}
              >
                {plan.price}
              </span>
            </div>
            <ul className="space-y-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-white/50">
                  <span
                    className={clsx(
                      'w-1 h-1 rounded-full flex-shrink-0',
                      data.plan === plan.id ? 'bg-[#00e87a]' : 'bg-white/30',
                    )}
                  />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      <p className="text-xs text-white/30 text-center">
        Keine Zahlungsdaten erforderlich — 14 Tage kostenlos testen
      </p>

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="flex-1 bg-white/5 border border-white/10 text-white/70 font-semibold py-3 rounded-lg text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          Zurück
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 bg-[#00e87a] text-[#080a0c] font-semibold py-3 rounded-lg text-sm hover:bg-[#00d46e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Wird registriert…
            </>
          ) : (
            'Konto erstellen'
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const STEP_TITLES = [
  'Betriebsdaten',
  'Inhaberkonto',
  'Plan auswählen',
];

export default function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [step1, setStep1] = useState<Step1Data>({
    companyName: '',
    vatNumber: '',
    street: '',
    city: '',
    zip: '',
    country: 'Österreich',
  });

  const [step2, setStep2] = useState<Step2Data>({
    ownerName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [step3, setStep3] = useState<Step3Data>({ plan: 'starter' });

  async function handleFinalSubmit() {
    setLoading(true);
    try {
      await api.post('/tenant/register', {
        tenantName: step1.companyName,
        vatNumber: step1.vatNumber || undefined,
        ownerName: step2.ownerName,
        ownerEmail: step2.email,
        ownerPassword: step2.password,
      });

      toast.success('Konto erfolgreich erstellt! Bitte melden Sie sich an.');
      navigate('/login');
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: { message?: string } } } }).response?.data
          ?.error?.message === 'string'
      ) {
        toast.error(
          (err as { response: { data: { error: { message: string } } } }).response.data.error
            .message,
        );
      } else {
        toast.error('Registrierung fehlgeschlagen. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0c] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-[#00e87a] font-bold text-2xl tracking-tight">kassomat</span>
          <p className="mt-2 text-white/40 text-sm">Konto registrieren</p>
        </div>

        {/* Card */}
        <div className="bg-[#0e1115] border border-white/5 rounded-2xl p-8">
          <div className="mb-6">
            <h2 className="text-white font-semibold text-lg">{STEP_TITLES[step - 1]}</h2>
            <p className="text-white/40 text-xs mt-0.5">Schritt {step} von 3</p>
          </div>

          <StepIndicator current={step} total={3} />

          {step === 1 && (
            <Step1
              data={step1}
              onChange={(d) => setStep1((prev) => ({ ...prev, ...d }))}
              onNext={() => setStep(2)}
            />
          )}
          {step === 2 && (
            <Step2
              data={step2}
              onChange={(d) => setStep2((prev) => ({ ...prev, ...d }))}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <Step3
              data={step3}
              onChange={(d) => setStep3((prev) => ({ ...prev, ...d }))}
              onSubmit={handleFinalSubmit}
              onBack={() => setStep(2)}
              loading={loading}
            />
          )}
        </div>

        <p className="text-center mt-6 text-white/40 text-sm">
          Bereits registriert?{' '}
          <Link to="/login" className="text-[#00e87a] hover:underline">
            Anmelden
          </Link>
        </p>
      </div>
    </div>
  );
}
