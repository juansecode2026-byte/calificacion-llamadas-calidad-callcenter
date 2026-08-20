import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  logout: () => void;
}

// Un store, un dominio (auth) — sin middleware, per STACK.md. La sesión real
// de Supabase todavía no está wireada (ver App.tsx): esto es el contenedor
// para cuando lo esté, no una integración funcionando hoy.
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));
