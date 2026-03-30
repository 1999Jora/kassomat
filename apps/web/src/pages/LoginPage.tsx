import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import type { AuthResponse } from '@kassomat/types';
import api from '../lib/api';
import useAuthStore from '../store/useAuthStore';

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'w-full bg-[#080a0c] border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm',
        'placeholder:text-white/30 focus:outline-none focus:border-[#00e87a]/60 focus:ring-1 focus:ring-[#00e87a]/20',
        'transition-colors',
        props.className ?? '',
      ].join(' ')}
    />
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Bitte E-Mail und Passwort eingeben');
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post<{ success: true; data: AuthResponse }>('/auth/login', { email, password });
      login(data.data.accessToken, data.data.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'response' in err
      ) {
        const axiosErr = err as { response?: { status?: number; data?: { error?: { message?: string } } } };
        if (axiosErr.response?.status === 401) {
          toast.error('Ungültige E-Mail oder Passwort');
        } else if (axiosErr.response?.data?.error?.message) {
          toast.error(axiosErr.response.data.error.message);
        } else {
          toast.error('Anmeldung fehlgeschlagen');
        }
      } else {
        toast.error('Verbindungsfehler. Bitte versuchen Sie es erneut.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#080a0c] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-[#00e87a] font-bold text-2xl tracking-tight">kassomat</span>
          <p className="mt-2 text-white/40 text-sm">Anmeldung</p>
        </div>

        {/* Card */}
        <div className="bg-[#0e1115] border border-white/5 rounded-2xl p-8">
          <h2 className="text-white font-semibold text-lg mb-6">Anmelden</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">
                E-Mail-Adresse
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="max@meinbetrieb.at"
                required
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1.5">Passwort</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-[#00e87a] text-[#080a0c] font-semibold py-3 rounded-lg text-sm hover:bg-[#00d46e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
                  Wird angemeldet…
                </>
              ) : (
                'Anmelden'
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-white/40 text-sm">
          Noch kein Konto?{' '}
          <Link to="/signup" className="text-[#00e87a] hover:underline">
            Jetzt registrieren
          </Link>
        </p>

        <Link
          to="/delivery/nav"
          className="mt-4 block text-center bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white/60 text-sm hover:bg-white/10 hover:text-white transition-colors"
        >
          🚗 Fahrer? <span className="text-white/80 font-medium">Mit PIN anmelden</span>
        </Link>
      </div>
    </div>
  );
}
