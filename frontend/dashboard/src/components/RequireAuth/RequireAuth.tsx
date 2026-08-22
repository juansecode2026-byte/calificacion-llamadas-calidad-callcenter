import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import styles from './RequireAuth.module.css';

/**
 * Guard de sesión real — reemplaza el TODO que quedaba en App.tsx desde que
 * el pipeline no existía. Usa Supabase Auth (ver hooks/useAuthBoot.ts, que
 * corre una sola vez en App.tsx y mantiene el store sincronizado).
 *
 * Estar autenticado no es lo mismo que ser evaluador activo — eso lo decide
 * RLS del lado de la base (is_evaluador_activo()), no este componente. Un
 * usuario logueado pero sin fila en "evaluadores" simplemente no va a ver
 * datos en las queries, no es responsabilidad del frontend duplicar esa regla.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);

  if (!initialized) {
    return <div className={styles.verificando}>Verificando sesión…</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
