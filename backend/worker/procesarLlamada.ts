import { supabase } from './supabase.ts';
import { transcribirAudio } from './transcribir.ts';
import { evaluarLlamada, type PreguntaPlantilla } from '../agent/client.ts';
import { parsearEvaluaciones } from '../agent/parser.ts';

/**
 * Lleva UNA llamada de 'pendiente' a 'calificada' (o 'error').
 *
 * El worker es el pegamento: no juzga (eso es del agente) ni calcula
 * veredictos (eso es de cerrar_calificacion() en la base). Solo mueve la
 * llamada por los pasos, en orden, y deja el estado consistente pase lo que
 * pase.
 */
export async function procesarLlamada(llamadaId: string): Promise<void> {
  try {
    // ---- Paso 2: transcripción ----
    await marcarEstado(llamadaId, 'transcribiendo');
    const transcripcion = await obtenerTranscripcion(llamadaId);

    // ---- Paso 3: evaluación por el agente ----
    await marcarEstado(llamadaId, 'evaluando');
    const { plantillaId, plantillaVersion, preguntas } = await obtenerPlantillaVigente();
    const crudas = await evaluarLlamada(transcripcion, preguntas);
    const detalles = parsearEvaluaciones(crudas, preguntas);

    // ---- Paso 4: persistir y calcular veredicto ----
    // Un reproceso deja la calificación anterior como no vigente en vez de
    // borrarla (migración 023) — el índice parcial
    // calificaciones_una_vigente_por_llamada solo permite una vigente.
    const { error: errorVigencia } = await supabase
      .from('calificaciones')
      .update({ vigente: false })
      .eq('llamada_id', llamadaId)
      .eq('vigente', true);
    if (errorVigencia) throw errorVigencia;

    const { data: calificacion, error: errorCalificacion } = await supabase
      .from('calificaciones')
      .insert({
        llamada_id: llamadaId,
        plantilla_id: plantillaId,
        plantilla_version: plantillaVersion,
        // evaluador_id queda null y origen='ia' (migración 018): la
        // calificación la produce la IA, no una persona.
        origen: 'ia',
      })
      .select('id')
      .single();
    if (errorCalificacion) throw errorCalificacion;

    const { error: errorDetalle } = await supabase.from('calificacion_detalle').insert(
      detalles.map((d) => ({
        calificacion_id: calificacion.id,
        parametro_id: d.parametro_id,
        valor: d.valor,
        no_aplica: d.no_aplica,
        justificacion_ia: d.justificacion_ia,
        origen: 'ia',
      })),
    );
    if (errorDetalle) throw errorDetalle;

    // El veredicto por categoría y el veredicto_venta los calcula la base,
    // nunca este código (CLAUDE.md, Restricciones). cerrar_calificacion()
    // falla si falta algún detalle — es la red de seguridad de H3.
    const { error: errorCierre } = await supabase.rpc('cerrar_calificacion', {
      p_calificacion_id: calificacion.id,
    });
    if (errorCierre) throw errorCierre;

    // ---- Paso 5: notificación ----
    // TODO: pendiente — el canal sale de configuracion_empresa.canal_notificacion
    // (email/whatsapp/chat) pero no hay proveedor elegido todavía.

    await marcarEstado(llamadaId, 'calificada');
  } catch (err) {
    // Cualquier fallo deja la llamada en 'error', nunca colgada en un estado
    // intermedio: una llamada atascada en 'evaluando' para siempre es
    // invisible, una en 'error' se ve en el dashboard.
    await marcarEstado(llamadaId, 'error');
    throw err;
  }
}

async function marcarEstado(llamadaId: string, estado: string): Promise<void> {
  const { error } = await supabase.from('llamadas').update({ estado }).eq('id', llamadaId);
  if (error) throw error;
}

/**
 * Usa la transcripción vigente si ya existe; si no, intenta transcribir
 * (que hoy falla a propósito — ver transcribir.ts).
 */
async function obtenerTranscripcion(llamadaId: string): Promise<string> {
  const { data, error } = await supabase
    .from('transcripciones')
    .select('texto')
    .eq('llamada_id', llamadaId)
    .eq('vigente', true)
    .maybeSingle();
  if (error) throw error;

  if (data?.texto?.trim()) return data.texto;

  const texto = await transcribirAudio(llamadaId);
  const { error: errorInsert } = await supabase.from('transcripciones').insert({
    llamada_id: llamadaId,
    texto,
    modelo: process.env.WHISPER_MODEL ?? 'desconocido',
  });
  if (errorInsert) throw errorInsert;
  return texto;
}

interface PlantillaVigente {
  plantillaId: string;
  plantillaVersion: number;
  preguntas: PreguntaPlantilla[];
}

async function obtenerPlantillaVigente(): Promise<PlantillaVigente> {
  const { data: plantilla, error: errorPlantilla } = await supabase
    .from('plantillas_evaluacion')
    .select('id, version')
    .eq('activo', true)
    .order('fecha_vigencia_desde', { ascending: false })
    .limit(1)
    .single();
  if (errorPlantilla) throw errorPlantilla;

  // Las preguntas se piden ordenadas por categoría y orden para que el
  // prompt sea estable entre llamadas — no por prolijidad: un orden que
  // cambia entre corridas es una fuente de variación que no controlamos,
  // justo lo que no queremos en un evaluador que debe ser consistente.
  const { data: filas, error: errorParametros } = await supabase
    .from('parametros_calidad')
    .select('id, pregunta, criterio_evaluacion, orden, categorias_evaluacion!inner(orden, plantilla_id)')
    .eq('activo', true)
    .eq('categorias_evaluacion.plantilla_id', plantilla.id);
  if (errorParametros) throw errorParametros;

  const preguntas: PreguntaPlantilla[] = (filas ?? [])
    .map((f) => ({
      parametro_id: f.id as string,
      pregunta: f.pregunta as string,
      criterio_evaluacion: f.criterio_evaluacion as string | null,
      ordenCategoria: (f.categorias_evaluacion as unknown as { orden: number }).orden,
      orden: f.orden as number,
    }))
    .sort((a, b) => a.ordenCategoria - b.ordenCategoria || a.orden - b.orden)
    .map(({ parametro_id, pregunta, criterio_evaluacion }) => ({
      parametro_id,
      pregunta,
      criterio_evaluacion,
    }));

  if (preguntas.length === 0) {
    throw new Error(`La plantilla vigente (${plantilla.id}) no tiene parámetros activos.`);
  }

  return {
    plantillaId: plantilla.id,
    plantillaVersion: plantilla.version,
    preguntas,
  };
}
