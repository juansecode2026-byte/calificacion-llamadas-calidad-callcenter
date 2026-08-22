import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

// El prompt y el schema se leen del disco en tiempo de ejecución, no se
// copian acá: system_prompt.md y output_schema.json son la fuente única de
// verdad (CLAUDE.md los documenta como tal). Así se puede afinar el criterio
// del evaluador sin tocar este archivo.
const SYSTEM_PROMPT = readFileSync(
  fileURLToPath(new URL('./system_prompt.md', import.meta.url)),
  'utf8',
);
const OUTPUT_SCHEMA = JSON.parse(
  readFileSync(fileURLToPath(new URL('./output_schema.json', import.meta.url)), 'utf8'),
);

// CLAUDE.md fija claude-sonnet-5 por defecto: balance entre criterio y costo,
// dado que corre por cada llamada evaluada. Override por env para poder
// comparar contra Opus/Haiku sin tocar código.
const MODELO = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';

// 9 preguntas con justificación citando la transcripción. 16k da margen de
// sobra; si alguna vez se trunca, el chequeo de stop_reason lo detecta en vez
// de devolver una evaluación incompleta en silencio.
const MAX_TOKENS = 16000;

export interface PreguntaPlantilla {
  parametro_id: string;
  pregunta: string;
  criterio_evaluacion: string | null;
}

/** Salida cruda del modelo, antes de que parser.ts la valide y convierta. */
export interface EvaluacionCruda {
  parametro_id: string;
  valor: '0' | '2' | 'n/a';
  justificacion: string;
}

export class ErrorAgente extends Error {
  constructor(
    message: string,
    readonly causa: 'refusal' | 'truncado' | 'formato' | 'api',
  ) {
    super(message);
    this.name = 'ErrorAgente';
  }
}

function armarMensaje(transcripcion: string, preguntas: PreguntaPlantilla[]): string {
  const listado = preguntas
    .map((p, i) => {
      const criterio = p.criterio_evaluacion?.trim()
        ? p.criterio_evaluacion.trim()
        : '(sin criterio detallado cargado — evaluar contra el texto de la pregunta)';
      return [
        `### Pregunta ${i + 1}`,
        `parametro_id: ${p.parametro_id}`,
        `Pregunta: ${p.pregunta}`,
        `Criterio de evaluación: ${criterio}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    '## Transcripción de la llamada',
    '',
    transcripcion,
    '',
    '## Preguntas a evaluar',
    '',
    listado,
    '',
    `Devolvé exactamente ${preguntas.length} evaluaciones, una por cada parametro_id de arriba.`,
  ].join('\n');
}

/**
 * Paso 3 del pipeline: manda la transcripción + las preguntas de la plantilla
 * al modelo y devuelve su juicio por pregunta, sin tocar la base.
 *
 * Este módulo NO calcula veredictos ni persiste nada — eso es del worker y de
 * `cerrar_calificacion()` en la base (CLAUDE.md, Restricciones).
 */
export async function evaluarLlamada(
  transcripcion: string,
  preguntas: PreguntaPlantilla[],
): Promise<EvaluacionCruda[]> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ErrorAgente('Falta ANTHROPIC_API_KEY en el entorno.', 'api');
  }
  if (preguntas.length === 0) {
    throw new ErrorAgente('No se recibió ninguna pregunta para evaluar.', 'formato');
  }
  if (!transcripcion.trim()) {
    throw new ErrorAgente('La transcripción vino vacía.', 'formato');
  }

  const client = new Anthropic();

  // Sin `temperature`: claude-sonnet-5 NO acepta parámetros de sampling
  // (temperature/top_p/top_k) — devuelven 400. La reproducibilidad entre
  // evaluaciones se apoya en el criterio explícito del system prompt y en
  // los criterio_evaluacion de cada pregunta, no en un sampling bajo.
  // El thinking adaptativo queda por defecto, que es lo apropiado para una
  // tarea de juicio con evidencia.
  const response = await client.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: armarMensaje(transcripcion, preguntas) }],
    output_config: {
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
  });

  // Una transcripción de una llamada real puede disparar un clasificador de
  // seguridad. Sin este chequeo, `content` vendría vacío y el parseo fallaría
  // con un error confuso en vez del motivo real.
  if (response.stop_reason === 'refusal') {
    throw new ErrorAgente(
      `El modelo declinó evaluar esta llamada (${response.stop_details?.category ?? 'sin categoría'}).`,
      'refusal',
    );
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ErrorAgente(
      'La respuesta se truncó por max_tokens — la evaluación quedaría incompleta.',
      'truncado',
    );
  }

  const bloqueTexto = response.content.find((b) => b.type === 'text');
  if (!bloqueTexto || bloqueTexto.type !== 'text') {
    throw new ErrorAgente('La respuesta no trajo ningún bloque de texto.', 'formato');
  }

  let payload: { evaluaciones?: EvaluacionCruda[] };
  try {
    payload = JSON.parse(bloqueTexto.text);
  } catch {
    throw new ErrorAgente('La respuesta no es JSON válido pese al schema.', 'formato');
  }

  if (!Array.isArray(payload.evaluaciones)) {
    throw new ErrorAgente('La respuesta no trae el arreglo "evaluaciones".', 'formato');
  }

  return payload.evaluaciones;
}
