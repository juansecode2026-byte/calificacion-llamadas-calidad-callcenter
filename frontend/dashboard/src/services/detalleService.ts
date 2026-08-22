import { supabase } from '../lib/supabaseClient';
import type { EstadoLlamada, VeredictoVenta } from '../components/EstadoChip/EstadoChip';
import type { Veredicto } from '../components/VerdictChip/VerdictChip';

/**
 * Detalle de UNA llamada: lo que el agente contestó pregunta por pregunta,
 * con su justificación, más el veredicto de cada categoría y el de la venta.
 *
 * Es la pantalla de auditoría: sin esto, el dashboard solo muestra el
 * veredicto final y no hay forma de revisar POR QUÉ salió así — que es
 * justamente lo que un equipo de calidad necesita para confiar (o no) en la
 * evaluación automática.
 *
 * Nada se recalcula acá: veredictos de categoría y de venta se leen tal cual
 * los dejó cerrar_calificacion() (CLAUDE.md, Restricciones).
 *
 * Se hace en varias queries en vez de un solo select anidado a propósito: el
 * anidamiento profundo de Postgrest (detalle -> parámetro -> categoría) es
 * frágil de tipar sin tipos generados, y el volumen acá es de una llamada.
 */

export interface PreguntaEvaluada {
  parametroId: string;
  pregunta: string;
  criterio: string | null;
  orden: number;
  valor: number | null; // null cuando no_aplica = true
  noAplica: boolean;
  justificacionIa: string | null;
  comentario: string | null;
  corregidoPorHumano: boolean;
  origen: string;
}

export interface CategoriaEvaluada {
  categoriaId: string;
  nombre: string;
  orden: number;
  veredicto: Veredicto;
  preguntasAprobadas: number;
  preguntasTotales: number; // preguntas APLICABLES, no las 3 fijas
  preguntasNoAplica: number;
  preguntas: PreguntaEvaluada[];
}

export interface DetalleLlamada {
  llamadaId: string;
  asesor: string;
  correoAsesor: string | null;
  estado: EstadoLlamada;
  fechaHora: string;
  duracionSeg: number | null;
  // null cuando la llamada todavía no se evaluó (cargada / pendiente / error)
  calificacionId: string | null;
  veredictoVenta: VeredictoVenta;
  requiereRevision: boolean;
  fechaEvaluacion: string | null;
  origen: string | null;
  categorias: CategoriaEvaluada[];
  transcripcion: string | null;
  modeloTranscripcion: string | null;
}

export async function obtenerDetalleLlamada(llamadaId: string): Promise<DetalleLlamada> {
  const { data: llamada, error: errorLlamada } = await supabase
    .from('llamadas')
    .select('id, estado, fecha_hora, duracion_seg, asesores(nombres, apellidos, correo)')
    .eq('id', llamadaId)
    .single();
  if (errorLlamada) throw errorLlamada;

  const asesor = llamada.asesores as unknown as {
    nombres: string;
    apellidos: string;
    correo: string;
  } | null;

  const [{ data: calificacion, error: errorCalificacion }, { data: transcripcion, error: errorTranscripcion }] =
    await Promise.all([
      supabase
        .from('calificaciones')
        .select('id, veredicto_venta, requiere_revision, fecha_evaluacion, origen')
        .eq('llamada_id', llamadaId)
        .eq('vigente', true)
        .maybeSingle(),
      supabase
        .from('transcripciones')
        .select('texto, modelo')
        .eq('llamada_id', llamadaId)
        .eq('vigente', true)
        .maybeSingle(),
    ]);
  if (errorCalificacion) throw errorCalificacion;
  if (errorTranscripcion) throw errorTranscripcion;

  const base: DetalleLlamada = {
    llamadaId: llamada.id,
    asesor: asesor ? `${asesor.nombres} ${asesor.apellidos}` : '(asesor no encontrado)',
    correoAsesor: asesor?.correo ?? null,
    estado: llamada.estado as EstadoLlamada,
    fechaHora: llamada.fecha_hora,
    duracionSeg: llamada.duracion_seg,
    calificacionId: null,
    veredictoVenta: null,
    requiereRevision: false,
    fechaEvaluacion: null,
    origen: null,
    categorias: [],
    transcripcion: transcripcion?.texto ?? null,
    modeloTranscripcion: transcripcion?.modelo ?? null,
  };

  // Llamada sin calificación vigente: cargada, pendiente, en proceso o en
  // error. Se devuelve lo que hay (incluida la transcripción si ya existe),
  // sin inventar categorías vacías que parezcan una evaluación real.
  if (!calificacion) return base;

  const [{ data: resultados, error: errorResultados }, { data: detalles, error: errorDetalles }] = await Promise.all([
    supabase
      .from('calificacion_categoria_resultado')
      .select(
        `categoria_id, veredicto, preguntas_aprobadas, preguntas_totales, preguntas_no_aplica,
         categorias_evaluacion!inner(nombre, orden)`,
      )
      .eq('calificacion_id', calificacion.id),
    supabase
      .from('calificacion_detalle')
      .select(
        `parametro_id, valor, no_aplica, justificacion_ia, comentario, corregido_por_humano, origen,
         parametros_calidad!inner(pregunta, criterio_evaluacion, orden, categoria_id)`,
      )
      .eq('calificacion_id', calificacion.id),
  ]);
  if (errorResultados) throw errorResultados;
  if (errorDetalles) throw errorDetalles;

  // Se agrupan las preguntas por categoría usando parametros_calidad.categoria_id
  const preguntasPorCategoria = new Map<string, PreguntaEvaluada[]>();
  for (const fila of detalles ?? []) {
    const parametro = fila.parametros_calidad as unknown as {
      pregunta: string;
      criterio_evaluacion: string | null;
      orden: number;
      categoria_id: string;
    };
    const lista = preguntasPorCategoria.get(parametro.categoria_id) ?? [];
    lista.push({
      parametroId: fila.parametro_id,
      pregunta: parametro.pregunta,
      criterio: parametro.criterio_evaluacion,
      orden: parametro.orden,
      valor: fila.valor,
      noAplica: fila.no_aplica,
      justificacionIa: fila.justificacion_ia,
      comentario: fila.comentario,
      corregidoPorHumano: fila.corregido_por_humano,
      origen: fila.origen,
    });
    preguntasPorCategoria.set(parametro.categoria_id, lista);
  }

  const categorias: CategoriaEvaluada[] = (resultados ?? [])
    .map((fila) => {
      const cat = fila.categorias_evaluacion as unknown as { nombre: string; orden: number };
      return {
        categoriaId: fila.categoria_id,
        nombre: cat.nombre,
        orden: cat.orden,
        veredicto: fila.veredicto as Veredicto,
        preguntasAprobadas: fila.preguntas_aprobadas,
        preguntasTotales: fila.preguntas_totales,
        preguntasNoAplica: fila.preguntas_no_aplica,
        preguntas: (preguntasPorCategoria.get(fila.categoria_id) ?? []).sort((a, b) => a.orden - b.orden),
      };
    })
    .sort((a, b) => a.orden - b.orden);

  return {
    ...base,
    calificacionId: calificacion.id,
    veredictoVenta: calificacion.veredicto_venta as VeredictoVenta,
    requiereRevision: calificacion.requiere_revision,
    fechaEvaluacion: calificacion.fecha_evaluacion,
    origen: calificacion.origen,
    categorias,
  };
}
