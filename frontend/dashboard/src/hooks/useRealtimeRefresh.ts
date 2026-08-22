import { useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * Se suscribe a cambios en llamadas y calificaciones (habilitadas en la
 * publicación supabase_realtime por la migración 030) y llama a `onChange`
 * ante cualquier evento.
 *
 * No parchea filas individuales en el estado del cliente — con el volumen
 * esperado (máximo 5 empresas, cargas manuales) es más simple y más
 * confiable volver a pedir todo que reconstruir el estado a mano evento por
 * evento. Si el volumen crece, esto es lo primero que se optimiza.
 *
 * Realtime respeta las policies de RLS ya existentes (evaluador_lee_*): un
 * usuario sin sesión de evaluador activo no recibe ningún evento.
 */
export function useRealtimeRefresh(onChange: () => void): void {
  useEffect(() => {
    const canal = supabase
      .channel('dashboard-pipeline')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamadas' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calificaciones' }, onChange)
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // Deps vacío a propósito: la suscripción se arma una sola vez. onChange
    // siempre llama a los setters de useState del caller (referencias
    // estables), así que no hace falta re-suscribir si su identidad cambia
    // entre renders — no hay estado capturado que se vuelva viejo.
  }, [onChange]);
}
