import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuthStore } from '../stores/authStore';

/**
 * Sincroniza el store de auth con la sesión real de Supabase al arrancar la
 * app, y la mantiene sincronizada después (login, logout, refresh de token,
 * o un logout hecho en otra pestaña).
 *
 * Se llama una sola vez, en App.tsx — no en cada página, para no suscribir
 * el listener más de una vez.
 */
export function useAuthBoot(): void {
  const setUser = useAuthStore((s) => s.setUser);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setInitialized();
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, [setUser, setInitialized]);
}
