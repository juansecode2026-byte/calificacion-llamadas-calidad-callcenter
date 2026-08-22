import { createClient } from '@supabase/supabase-js';

// El worker corre con service_role: bypassea RLS a propósito (db/policies/
// 001_baseline.sql lo documenta — las policies son para el humano en el
// dashboard, no para el pipeline).
//
// Esta key NUNCA puede llevar prefijo VITE_ ni viajar al navegador: es
// acceso total a la base. Ver CLAUDE.md, "Variables de entorno".
const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('Falta VITE_SUPABASE_URL en el entorno (.env de la raíz del proyecto).');
}
if (!serviceRoleKey) {
  throw new Error(
    'Falta SUPABASE_SERVICE_ROLE_KEY en el entorno. Se saca del dashboard de Supabase (Settings > API Keys, sección Secret keys) — nunca de una variable VITE_.',
  );
}

export const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
