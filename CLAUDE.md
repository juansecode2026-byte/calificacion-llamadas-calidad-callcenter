# CLAUDE.md

@STACK.md
<!-- Import del stack tecnológico estándar. Ruta relativa a propósito:
     STACK.md vive en la raíz de ESTE repo (no en la carpeta personal),
     así el equipo lo recibe automáticamente al clonar. Copiado el
     2026-08-13 desde la plantilla maestra de la skill `fullstack`. -->

## Overview
Sistema de evaluación de calidad de llamadas para un call center de ventas. Automatiza el pipeline completo: ingesta de audio → transcripción → evaluación por IA → cálculo de veredicto → notificación al asesor → dashboard de métricas. Reemplaza el proceso manual donde una persona de calidad escuchaba cada llamada y decidía si respaldaba la venta.

## Estructura de carpetas
```
/CLAUDE.md
/docs
  CONTEXT.md
/db
  000_schema_inicial.sql
  migrations/
  policies/
  README.md          # orden de ejecución — ver antes de levantar un proyecto nuevo
/backend
  functions/         # incluye la carga manual de llamadas
  worker/
  agent/
/frontend
  dashboard/
    src/{pages,components,charts,hooks,lib}
    public/
```
(Detalle completo y mecánica de scaffolding: skill `fullstack`.)

## Flujo del pipeline (orden fijo, no alterar)
1. **Ingesta** — carga manual desde el dashboard: se busca al asesor por su correo (con autocompletado y confirmación visual del nombre) y se adjunta el audio. Una Edge Function guarda el archivo en Storage, calcula la duración leyendo el archivo, y crea el registro de la llamada. No hay integración automática con ningún dialer por ahora.
2. **Transcripción** — Whisper procesa el audio, resultado vinculado a la llamada. Script.
3. **Evaluación** — el agente recibe la transcripción completa + preguntas y criterios de la plantilla activa en un solo prompt estructurado. Devuelve JSON con `valor` y `justificacion` por pregunta. Único paso con juicio/inferencia.
4. **Cálculo y veredicto** — suma de puntajes por categoría, aplicación del umbral de aprobación, decisión final. Siempre script determinista, nunca el agente.
5. **Notificación** — envío automático al asesor con el detalle y justificación por pregunta.
6. **Dashboard** — resultados, histórico por asesor, probabilidad de éxito, KPIs.

## Reglas de negocio clave
- Cada asesor se identifica en la carga manual por su `correo` — reutiliza lo que la empresa ya maneja, no un código nuevo. Único por `(empresa_id, correo)`. La relación real (`calls.advisor_id`) sigue siendo por id interno, no por correo — si el correo cambia, no rompe el historial de llamadas.
- El disparo del pipeline es manual: un botón en el dashboard, no automático al recibir el audio.
- El pipeline es asíncrono: el botón marca la llamada como `pendiente` y responde de inmediato. Un worker separado procesa. El dashboard usa Supabase Realtime para reflejar el cambio de estado. **Nunca correr el pipeline dentro del request HTTP del botón.**
- El agente evalúa con estándar de auditor experto: solo evidencia explícita en la transcripción, sin inferencias, criterio consistente entre llamadas, puntaje mínimo cuando el audio es ambiguo.
- Plantilla vigente: **"LID de montos grandes"** — 3 categorías (Perfilado, Trabajo sobre el monto, Trabajo con objeciones), 9 preguntas binarias (0/2), regla de mayoría por categoría (2 de 3 aprobadas = categoría aprueba), `umbral_aprobacion` = 0.66 en las tres categorías.
- **Valor "n/a" (no aplica):** una pregunta puede resultar en `n/a` cuando la situación que evalúa no se dio en esa llamada puntual (ej: "¿Existe argumento en contra?" cuando el cliente no puso ninguna objeción). Es una excepción, no un comodín — el agente solo puede usarlo cuando la ausencia es estructural, nunca por ambigüedad en la transcripción (eso sigue siendo `0`). Ver `backend/agent/system_prompt.md`, regla 8.
- **Cálculo del veredicto con `n/a` presente:** las preguntas en `n/a` se excluyen del cálculo de esa categoría — el denominador pasa de 3 a 2 (o menos) preguntas aplicables. El umbral 0.66 se aplica sobre las preguntas aplicables, no sobre las 3 fijas. Si las 3 preguntas de una categoría resultan `n/a`, esa categoría queda sin veredicto y se marca para revisión — no se aprueba ni se rechaza por defecto.
- **Veredicto final de la venta — regla de los 3 indicadores.** Los "3 indicadores" del negocio son las 3 categorías de la plantilla. Si al menos **2 de 3** dan `SI`, la venta se le tiene en cuenta al asesor (`CUENTA`); si no, `NO_CUENTA`. El umbral es absoluto —hacen falta 2 `SI`—, no proporcional a cuántas categorías resultaron aplicables. Una categoría en `SIN_VEREDICTO` no suma, pero marca `requiere_revision`. El `n/a` no tiene frecuencia esperada —no hay cuota ni "debería aparecer de vez en cuando"—: se usa si y solo si la situación que evalúa la pregunta no se dio en esa llamada, según los parámetros. Que las 3 preguntas de una categoría no apliquen es posible pero inusual, y por eso merece una mirada humana. Ver `db/migrations/011_veredicto_venta.sql` y el caso real en `docs/plantilla-lid-montos-grandes-ejemplo-real.jpeg`.
- **El veredicto de categoría siempre es texto: `"SI"` o `"NO"`, nunca un número.** `score.ts` debe tener ese tipo de retorno fijo — no una fórmula que arrastre el puntaje crudo a la celda de resultado. Confirmado a partir de un error real detectado en las plantillas de referencia: una categoría con 2/2/2 mostró "2" en la celda de veredicto en vez de "SI", por una fórmula mal copiada. Ese tipo de error es imposible si el tipo de dato de salida está restringido desde el diseño.
- `scores` y `score_detail` distinguen origen manual vs. IA, y permiten corrección humana sobre la justificación de la IA.

## Agente evaluador (paso 3 del pipeline)
- **Modelo:** `claude-sonnet-5` por defecto. Balance entre criterio (evidencia + matices) y costo, dado que corre por cada llamada evaluada. Subir a Opus solo si la validación de calidad muestra fallos en casos ambiguos; bajar a Haiku 4.5 solo tras comparar resultados reales.
- **Structured Outputs (JSON Schema):** la respuesta del modelo queda forzada a cumplir el schema a nivel de generación — `valor` no puede ser otra cosa que 0 o 2. Ver `backend/agent/output_schema.json`.
- **`temperature` baja:** para reproducibilidad entre evaluaciones de la misma llamada. No es 100% determinístico incluso en 0 — solo reduce la variación.
- **División de responsabilidades:** la API garantiza el formato; `parser.ts` solo valida reglas de negocio (que los 9 `id` de la plantilla estén presentes, ninguno repetido ni faltante).

```
backend/agent/
├── system_prompt.md      # persona + reglas del evaluador
├── output_schema.json    # JSON Schema del veredicto por pregunta
├── client.ts             # llamada a la API con Structured Outputs
└── parser.ts             # valida reglas de negocio, no formato
```

## Archivos de referencia
- `docs/CONTEXT.md` — contexto de negocio y técnico completo
- `db/README.md` — orden de ejecución del SQL, leer antes de levantar un proyecto nuevo
- `db/000_schema_inicial.sql` — schema base con seed data (⚠️ nunca correr solo, ver `db/README.md`)
- `backend/agent/system_prompt.md` — system prompt del agente evaluador
- `docs/caso-de-referencia-criterios.md` — lógica de los criterios deducida del
  único caso real calificado a mano (`docs/plantilla-lid-montos-grandes-ejemplo-real.jpeg`).
  Leer antes de redactar los textos de `criterio_evaluacion`.

## Estado actual
- Modelo de datos completo: advisors, evaluators, calls, transcriptions, evaluation templates, categories, quality parameters, scores, score_detail, category results.
- Plantilla "LID de montos grandes" sembrada con criterios de evaluación por pregunta.
- Skill `fullstack` disponible para crear/mantener la estructura de carpetas.

## Pendiente / en decisión
- Validar textos de `criterio_evaluacion` con el equipo de calidad.
- Decidir si se implementa diarización de hablantes en la transcripción.
- Confirmar si existen plantillas de evaluación además de "LID de montos grandes".
- Definir la fórmula del indicador de probabilidad de éxito.
- Decidir si se implementa una fase de revisión humana (IA sugiere → humano confirma/corrige) antes de pasar a 100% automático. Recomendado, no confirmado.
- Confirmar quién sube las llamadas al dashboard (equipo de calidad, el propio asesor, o cualquiera con acceso) — hoy el formulario no distingue, cualquiera con acceso puede seleccionar el asesor y subir.

## Restricciones
- No correr el pipeline de evaluación de forma síncrona en el request del botón.
- El veredicto y el cálculo de puntajes nunca los decide el agente — siempre script determinista.
- No mezclar responsabilidades del agente evaluador con lógica de cálculo o persistencia.
- El stack tecnológico general no se repite aquí — vive en `~/estandares/STACK.md` (import arriba). Este archivo solo documenta lo específico de este proyecto.
