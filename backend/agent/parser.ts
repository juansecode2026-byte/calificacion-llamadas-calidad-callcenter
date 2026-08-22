import type { EvaluacionCruda, PreguntaPlantilla } from './client.ts';

/**
 * Fila lista para insertar en `calificacion_detalle`.
 *
 * El mapeo lo fija CLAUDE.md y el propio output_schema.json:
 *   "0" / "2"  ->  valor entero, no_aplica = false
 *   "n/a"      ->  valor null,   no_aplica = true
 *
 * Ese par respeta el check `calificacion_detalle_valor_o_na` de la migración
 * 008: o hay valor y no_aplica=false, o valor es null y no_aplica=true.
 */
export interface DetalleParaInsertar {
  parametro_id: string;
  valor: number | null;
  no_aplica: boolean;
  justificacion_ia: string;
}

export class ErrorParser extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErrorParser';
  }
}

/**
 * Valida REGLAS DE NEGOCIO, no formato.
 *
 * El formato ya lo garantiza Structured Outputs a nivel de generación (los
 * valores solo pueden ser "0"/"2"/"n/a", los tres campos son obligatorios).
 * Lo que la API no puede garantizar es que el modelo haya respondido por
 * TODAS las preguntas de la plantilla y por ninguna otra — eso se chequea
 * acá (CLAUDE.md, "División de responsabilidades").
 *
 * Falla ruidosamente en vez de devolver un resultado parcial: una evaluación
 * incompleta haría que `calcular_veredicto_categoria()` aborte igual
 * (migración 014, hallazgo H3), pero con un error mucho menos claro.
 */
export function parsearEvaluaciones(
  crudas: EvaluacionCruda[],
  preguntas: PreguntaPlantilla[],
): DetalleParaInsertar[] {
  const esperados = new Set(preguntas.map((p) => p.parametro_id));
  const vistos = new Set<string>();

  for (const ev of crudas) {
    if (!esperados.has(ev.parametro_id)) {
      throw new ErrorParser(
        `El modelo devolvió un parametro_id que no está en la plantilla: ${ev.parametro_id}`,
      );
    }
    if (vistos.has(ev.parametro_id)) {
      throw new ErrorParser(`El modelo repitió el parametro_id ${ev.parametro_id}`);
    }
    vistos.add(ev.parametro_id);
  }

  const faltantes = [...esperados].filter((id) => !vistos.has(id));
  if (faltantes.length > 0) {
    throw new ErrorParser(
      `Faltan ${faltantes.length} evaluación(es) de ${esperados.size}: ${faltantes.join(', ')}`,
    );
  }

  return crudas.map((ev) => {
    if (!ev.justificacion?.trim()) {
      throw new ErrorParser(`La evaluación de ${ev.parametro_id} vino sin justificación.`);
    }

    if (ev.valor === 'n/a') {
      return {
        parametro_id: ev.parametro_id,
        valor: null,
        no_aplica: true,
        justificacion_ia: ev.justificacion.trim(),
      };
    }

    return {
      parametro_id: ev.parametro_id,
      valor: Number(ev.valor),
      no_aplica: false,
      justificacion_ia: ev.justificacion.trim(),
    };
  });
}
