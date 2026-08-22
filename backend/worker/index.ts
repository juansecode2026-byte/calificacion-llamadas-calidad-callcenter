// Este import va PRIMERO: carga el .env de la raíz del proyecto antes de que
// supabase.ts lea process.env. Ver worker/env.ts.
import './env.ts';
import { supabase } from './supabase.ts';
import { procesarLlamada } from './procesarLlamada.ts';

const INTERVALO_MS = Number(process.env.WORKER_INTERVALO_MS ?? 10_000);

let corriendo = true;

/**
 * Toma UNA llamada pendiente y la reclama de forma atómica.
 *
 * El `.eq('estado', 'pendiente')` en el UPDATE es el candado: si dos workers
 * leyeron la misma fila, solo el primero la actualiza — el segundo recibe 0
 * filas y sigue de largo. Sin eso, dos workers evaluarían la misma llamada
 * y la cobrarían dos veces a la API.
 */
async function reclamarLlamada(): Promise<string | null> {
  const { data: candidata, error: errorSelect } = await supabase
    .from('llamadas')
    .select('id')
    .eq('estado', 'pendiente')
    .order('fecha_carga', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (errorSelect) throw errorSelect;
  if (!candidata) return null;

  const { data: reclamada, error: errorUpdate } = await supabase
    .from('llamadas')
    .update({ estado: 'transcribiendo' })
    .eq('id', candidata.id)
    .eq('estado', 'pendiente')
    .select('id');
  if (errorUpdate) throw errorUpdate;

  return reclamada && reclamada.length > 0 ? candidata.id : null;
}

async function tick(): Promise<void> {
  const llamadaId = await reclamarLlamada();
  if (!llamadaId) return;

  console.log(`[worker] procesando llamada ${llamadaId}`);
  try {
    await procesarLlamada(llamadaId);
    console.log(`[worker] llamada ${llamadaId} calificada`);
  } catch (err) {
    // procesarLlamada ya dejó la llamada en 'error' antes de re-lanzar.
    // Se loguea y se sigue: una llamada que falla no puede tumbar el worker
    // ni bloquear la cola de las demás.
    console.error(
      `[worker] llamada ${llamadaId} quedó en error:`,
      err instanceof Error ? err.message : err,
    );
  }
}

async function main(): Promise<void> {
  console.log(`[worker] arrancando — consultando cada ${INTERVALO_MS}ms`);

  const detener = () => {
    console.log('\n[worker] cerrando al terminar el ciclo actual…');
    corriendo = false;
  };
  process.on('SIGINT', detener);
  process.on('SIGTERM', detener);

  while (corriendo) {
    try {
      await tick();
    } catch (err) {
      // Error de infraestructura (base caída, red). No mata el proceso: el
      // próximo ciclo reintenta solo.
      console.error('[worker] error en el ciclo:', err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }

  console.log('[worker] detenido.');
}

main();
