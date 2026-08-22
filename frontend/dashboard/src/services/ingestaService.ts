import { supabase } from '../lib/supabaseClient';

/**
 * Ingesta manual (paso 1 del pipeline, CLAUDE.md) — busca al asesor para
 * confirmación visual antes de subir, y llama a la Edge Function
 * `cargar-llamada` (backend/functions/cargar-llamada) para el envío real.
 */

export interface AsesorEncontrado {
  nombres: string;
  apellidos: string;
}

// ilike en vez de eq: el índice único de asesores.correo es sobre
// lower(trim(correo)) (migración 019), pero la columna cruda puede tener
// otra capitalización — un eq exacto fallaría en ese caso.
export async function buscarAsesorPorCorreo(correo: string): Promise<AsesorEncontrado | null> {
  const normalizado = correo.trim();
  if (!normalizado) return null;

  const { data, error } = await supabase
    .from('asesores')
    .select('nombres, apellidos')
    .ilike('correo', normalizado)
    .eq('activo', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface ResultadoCarga {
  llamadaId: string;
  asesor: string;
  duracionSeg: number | null;
}

export async function subirLlamada(correo: string, archivo: File): Promise<ResultadoCarga> {
  const form = new FormData();
  form.append('correo', correo.trim());
  form.append('audio', archivo);

  const { data, error } = await supabase.functions.invoke('cargar-llamada', { body: form });
  if (error) {
    // FunctionsHttpError trae el body de la respuesta (con nuestro {error})
    // en error.context — si no se puede leer, se cae al mensaje genérico.
    const contexto = (error as { context?: Response }).context;
    const cuerpo = contexto ? await contexto.json().catch(() => null) : null;
    throw new Error(cuerpo?.error ?? error.message ?? 'No se pudo subir la llamada.');
  }

  return {
    llamadaId: data.llamada_id,
    asesor: data.asesor,
    duracionSeg: data.duracion_seg ?? null,
  };
}

// Dispara la evaluación: cargada -> pendiente (migración 031). Corre con
// la sesión del evaluador (RLS acota exactamente esta transición) — no
// necesita pasar por una Edge Function.
export async function dispararEvaluacion(llamadaId: string): Promise<void> {
  const { error } = await supabase
    .from('llamadas')
    .update({ estado: 'pendiente' })
    .eq('id', llamadaId)
    .eq('estado', 'cargada');
  if (error) throw error;
}
