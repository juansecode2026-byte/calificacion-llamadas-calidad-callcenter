-- Migración 003: transcripción de audio (paso 2 del pipeline)
--
-- Resultado de Whisper/faster-whisper, vinculado a la llamada. Es el insumo
-- que recibe el agente evaluador en el paso 3 (ver CLAUDE.md).

create table transcripciones (
  id uuid primary key default gen_random_uuid(),
  llamada_id uuid references llamadas(id) not null,
  texto text not null,
  modelo text not null, -- ej. 'whisper-medium', 'faster-whisper'
  fecha_transcripcion timestamptz not null default now()
);

-- Una llamada tiene a lo sumo una transcripción vigente.
create unique index transcripciones_llamada_unique on transcripciones(llamada_id);

-- Pendiente (ver docs/CONTEXT.md sección 6): si se decide diarización,
-- agregar acá una columna o tabla aparte para separar hablantes — no se
-- construye todavía porque esa decisión sigue abierta.
