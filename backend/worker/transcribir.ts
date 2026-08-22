/**
 * Paso 2 del pipeline — TODAVÍA NO IMPLEMENTADO.
 *
 * Falla ruidosamente a propósito. La alternativa (devolver texto de relleno)
 * haría que el agente evalúe una transcripción falsa y produzca un veredicto
 * con apariencia de real sobre una llamada que nadie transcribió — el peor
 * resultado posible para un sistema cuyo output afecta a un asesor real.
 *
 * Lo que falta decidir antes de escribir esto (docs/CONTEXT.md sección 6):
 *   - Whisper local vs. faster-whisper vs. servicio externo.
 *   - **Diarización**: separar "Asesor:" de "Cliente:" en el texto. No es un
 *     detalle cosmético — el system_prompt del agente evalúa la conducta del
 *     ASESOR, no la del cliente (regla 9). Sin diarización, el agente tiene
 *     que inferir quién habla, que es exactamente el tipo de inferencia que
 *     la regla 1 le prohíbe.
 *
 * Mientras tanto el worker sí procesa llamadas que YA tengan una
 * transcripción vigente cargada a mano — útil para probar el resto del
 * pipeline de punta a punta sin depender de esta pieza.
 */
export class TranscripcionNoImplementada extends Error {
  constructor(llamadaId: string) {
    super(
      `La llamada ${llamadaId} no tiene transcripción vigente y la transcripción automática todavía no está implementada (falta decidir diarización — ver docs/CONTEXT.md sección 6). Cargá una transcripción a mano en la tabla "transcripciones" para probar el resto del pipeline.`,
    );
    this.name = 'TranscripcionNoImplementada';
  }
}

export async function transcribirAudio(llamadaId: string): Promise<string> {
  throw new TranscripcionNoImplementada(llamadaId);
}
