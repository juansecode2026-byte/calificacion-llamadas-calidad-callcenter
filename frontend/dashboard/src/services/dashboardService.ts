import { supabase } from '../lib/supabaseClient';
import type { PuntoTendencia } from '../charts/TrendChart/TrendChart';
import type { EstadoLlamada, VeredictoVenta } from '../components/EstadoChip/EstadoChip';

/**
 * Queries de lectura para el dashboard — reemplaza Dashboard.mockData.ts.
 *
 * Todo lo que agrega (KPIs, tendencia, categorías, asesores) se calcula
 * client-side a partir de filas crudas, no con GROUP BY en Postgres: el
 * volumen esperado es bajo (máximo 5 empresas, cargas manuales), así que
 * una vista o función SQL nueva sería complejidad que todavía no hace
 * falta. Si el volumen crece, esto es lo primero que se mueve a la base.
 *
 * El veredicto de categoría y de venta nunca se recalculan acá — se leen
 * tal cual los dejó cerrar_calificacion() (CLAUDE.md, Restricciones).
 */

function inicioDeMes(): string {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
}

// ---------- KPIs ----------

export interface Kpis {
  ventasQueCuentanPct: number | null; // null = todavía no hay ninguna calificación con veredicto
  llamadasAuditadas: number;
  enProceso: number;
  requiereRevision: number;
}

export async function obtenerKpis(): Promise<Kpis> {
  const [cuenta, totalConVeredicto, auditadas, enProceso, requiereRevision] = await Promise.all([
    supabase
      .from('calificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('vigente', true)
      .eq('veredicto_venta', 'CUENTA'),
    supabase
      .from('calificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('vigente', true)
      .not('veredicto_venta', 'is', null),
    supabase.from('calificaciones').select('id', { count: 'exact', head: true }).eq('vigente', true),
    supabase
      .from('llamadas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['transcribiendo', 'evaluando']),
    supabase
      .from('calificaciones')
      .select('id', { count: 'exact', head: true })
      .eq('vigente', true)
      .eq('requiere_revision', true),
  ]);

  for (const r of [cuenta, totalConVeredicto, auditadas, enProceso, requiereRevision]) {
    if (r.error) throw r.error;
  }

  const total = totalConVeredicto.count ?? 0;
  return {
    ventasQueCuentanPct: total > 0 ? Math.round(((cuenta.count ?? 0) / total) * 100) : null,
    llamadasAuditadas: auditadas.count ?? 0,
    enProceso: enProceso.count ?? 0,
    requiereRevision: requiereRevision.count ?? 0,
  };
}

// ---------- Tendencia (últimas 12 semanas) ----------

export async function obtenerTendencia(): Promise<PuntoTendencia[]> {
  const doceSemanasAtras = new Date();
  doceSemanasAtras.setDate(doceSemanasAtras.getDate() - 12 * 7);

  const { data, error } = await supabase
    .from('calificaciones')
    .select('fecha_evaluacion, veredicto_venta')
    .eq('vigente', true)
    .not('veredicto_venta', 'is', null)
    .gte('fecha_evaluacion', doceSemanasAtras.toISOString())
    .order('fecha_evaluacion', { ascending: true });
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Agrupa por semana (lunes de esa semana como clave) y calcula el % que
  // dio CUENTA. Semanas sin ninguna calificación simplemente no aparecen
  // en el resultado — el gráfico las salta, no las muestra en 0.
  const porSemana = new Map<string, { cuenta: number; total: number }>();
  for (const fila of data) {
    const fecha = new Date(fila.fecha_evaluacion);
    const lunes = new Date(fecha);
    const diaSemana = (lunes.getDay() + 6) % 7; // lunes=0 ... domingo=6
    lunes.setDate(lunes.getDate() - diaSemana);
    const clave = lunes.toISOString().slice(0, 10);

    const acumulado = porSemana.get(clave) ?? { cuenta: 0, total: 0 };
    acumulado.total += 1;
    if (fila.veredicto_venta === 'CUENTA') acumulado.cuenta += 1;
    porSemana.set(clave, acumulado);
  }

  return [...porSemana.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, { cuenta, total }]) => ({
      semana: new Date(clave).toLocaleDateString('es', { day: 'numeric', month: 'short' }),
      porcentajeCuenta: Math.round((cuenta / total) * 100),
    }));
}

// ---------- Estado en tiempo real (últimas llamadas) ----------

export interface FilaPipeline {
  id: string;
  asesor: string;
  estado: EstadoLlamada;
  veredictoVenta?: VeredictoVenta;
  requiereRevision?: boolean;
}

export async function obtenerPipelineEnVivo(limite = 8): Promise<FilaPipeline[]> {
  const { data, error } = await supabase
    .from('llamadas')
    .select(
      `id, estado, fecha_carga,
       asesores(nombres, apellidos),
       calificaciones(veredicto_venta, requiere_revision, vigente)`,
    )
    .order('fecha_carga', { ascending: false })
    .limit(limite);
  if (error) throw error;

  return (data ?? []).map((fila) => {
    // calificaciones es un arreglo (una llamada puede tener versiones no
    // vigentes de reprocesos anteriores, migración 023) — se toma la vigente.
    const vigente = (fila.calificaciones ?? []).find((c) => c.vigente);
    // Sin tipos generados de Supabase, TS no puede saber que asesores es
    // una relación uno-a-uno (llamadas.asesor_id -> asesores.id) y la infiere
    // como si pudiera ser un arreglo — Postgrest en tiempo real sí devuelve
    // un objeto único acá. El cast por "unknown" es el puente entre las dos.
    const asesor = fila.asesores as unknown as { nombres: string; apellidos: string } | null;
    return {
      id: fila.id,
      asesor: asesor ? `${asesor.nombres} ${asesor.apellidos}` : '(asesor no encontrado)',
      estado: fila.estado as EstadoLlamada,
      veredictoVenta: vigente?.veredicto_venta as VeredictoVenta | undefined,
      requiereRevision: vigente?.requiere_revision,
    };
  });
}

// ---------- Puntaje por categoría (mes en curso) ----------

export interface FilaCategoria {
  nombre: string;
  orden: number;
  porcentaje: number | null; // null = ninguna calificación con veredicto SI/NO todavía
  detalle: string;
  sinVeredictoCount: number;
}

export async function obtenerCategorias(): Promise<FilaCategoria[]> {
  const { data, error } = await supabase
    .from('calificacion_categoria_resultado')
    .select(
      `categoria_id, veredicto, preguntas_aprobadas, preguntas_totales,
       categorias_evaluacion!inner(nombre, orden),
       calificaciones!inner(vigente, fecha_evaluacion)`,
    )
    .eq('calificaciones.vigente', true)
    .gte('calificaciones.fecha_evaluacion', inicioDeMes());
  if (error) throw error;

  interface Acumulado {
    nombre: string;
    orden: number;
    aprobadas: number;
    aplicables: number;
    sinVeredicto: number;
  }
  const porCategoria = new Map<string, Acumulado>();

  for (const fila of data ?? []) {
    const cat = fila.categorias_evaluacion as unknown as { nombre: string; orden: number };
    const acumulado = porCategoria.get(fila.categoria_id) ?? {
      nombre: cat.nombre,
      orden: cat.orden,
      aprobadas: 0,
      aplicables: 0,
      sinVeredicto: 0,
    };

    if (fila.veredicto === 'SIN_VEREDICTO') {
      acumulado.sinVeredicto += 1;
    } else {
      acumulado.aprobadas += fila.preguntas_aprobadas;
      acumulado.aplicables += fila.preguntas_totales;
    }
    porCategoria.set(fila.categoria_id, acumulado);
  }

  return [...porCategoria.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => ({
      nombre: c.nombre,
      orden: c.orden,
      porcentaje: c.aplicables > 0 ? Math.round((c.aprobadas / c.aplicables) * 100) : null,
      detalle: `${c.aprobadas} / ${c.aplicables} aplicables`,
      sinVeredictoCount: c.sinVeredicto,
    }));
}

// ---------- Asesores destacados (mes en curso) ----------

export interface FilaAsesor {
  nombre: string;
  porcentajeCuenta: number;
}

export async function obtenerAsesoresDestacados(limite = 5): Promise<FilaAsesor[]> {
  const { data, error } = await supabase
    .from('calificaciones')
    .select(
      `veredicto_venta,
       llamadas!inner(asesores!inner(id, nombres, apellidos))`,
    )
    .eq('vigente', true)
    .not('veredicto_venta', 'is', null)
    .gte('fecha_evaluacion', inicioDeMes());
  if (error) throw error;

  interface Acumulado {
    nombre: string;
    cuenta: number;
    total: number;
  }
  const porAsesor = new Map<string, Acumulado>();

  for (const fila of data ?? []) {
    const llamada = fila.llamadas as unknown as {
      asesores: { id: string; nombres: string; apellidos: string };
    };
    const asesor = llamada.asesores;
    const acumulado = porAsesor.get(asesor.id) ?? {
      nombre: `${asesor.nombres} ${asesor.apellidos}`,
      cuenta: 0,
      total: 0,
    };
    acumulado.total += 1;
    if (fila.veredicto_venta === 'CUENTA') acumulado.cuenta += 1;
    porAsesor.set(asesor.id, acumulado);
  }

  return [...porAsesor.values()]
    .map((a) => ({ nombre: a.nombre, porcentajeCuenta: Math.round((a.cuenta / a.total) * 100) }))
    .sort((a, b) => b.porcentajeCuenta - a.porcentajeCuenta)
    .slice(0, limite);
}
