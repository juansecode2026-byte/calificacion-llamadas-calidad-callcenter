import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  // Distingue "todavía no verificamos la sesión" de "ya verificamos y no hay
  // usuario" — sin esto, un RequireAuth redirigiría a "/" en el primer
  // render aunque exista una sesión válida (getSession() es async).
  initialized: boolean;
  setUser: (user: User | null) => void;
  setInitialized: () => void;
  logout: () => void;
}

// Un store, un dominio (auth) — sin middleware, per STACK.md.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  initialized: false,
  setUser: (user) => set({ user }),
  setInitialized: () => set({ initialized: true }),
  logout: () => set({ user: null }),
}));
