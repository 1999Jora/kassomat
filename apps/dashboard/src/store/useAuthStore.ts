import { create } from 'zustand';
import type { PublicUser } from '@kassomat/types';

interface AuthState {
  token: string | null;
  user: PublicUser | null;
  login: (token: string, user: PublicUser) => void;
  logout: () => void;
}

// Rehydrate from localStorage on initial load
function getInitialToken(): string | null {
  try {
    return localStorage.getItem('kassomat_token');
  } catch {
    return null;
  }
}

function getInitialUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem('kassomat_user');
    if (!raw) return null;
    return JSON.parse(raw) as PublicUser;
  } catch {
    return null;
  }
}

const useAuthStore = create<AuthState>((set) => ({
  token: getInitialToken(),
  user: getInitialUser(),

  login: (token: string, user: PublicUser) => {
    localStorage.setItem('kassomat_token', token);
    localStorage.setItem('kassomat_user', JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem('kassomat_token');
    localStorage.removeItem('kassomat_user');
    set({ token: null, user: null });
  },
}));

export default useAuthStore;
