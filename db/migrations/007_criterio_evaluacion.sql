-- Migración 007: criterio de evaluación por pregunta
--
-- backend/agent/system_prompt.md asume `parametros_calidad.criterio_evaluacion`
-- (regla 2: "evalúa cada pregunta únicamente contra su criterio_evaluacion
-- asociado") — esa columna no existía en el schema original.

alter table parametros_calidad
  add column criterio_evaluacion text;

comment on column parametros_calidad.criterio_evaluacion is
  'Criterio detallado que usa el agente para evaluar esta pregunta (no el texto corto de la pregunta). Nullable a propósito: CLAUDE.md marca "Validar textos de criterio_evaluacion con el equipo de calidad" como pendiente — completar antes de activar el agente en producción.';

-- No se siembra automáticamente para las 9 preguntas de "LID de montos
-- grandes": el texto real lo define el equipo de calidad, no se inventa acá.
