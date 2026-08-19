-- Migracion 026: transcripciones.vigente
--
-- Cierra H21 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- El unique index sobre transcripciones(llamada_id) (migracion 003)
-- impedia re-transcribir una llamada sin borrar la fila anterior primero
-- -- destruyendo la evidencia de la evaluacion ya hecha contra esa
-- transcripcion. El propio comentario de la 003 hablaba de "transcripcion
-- vigente", lo que ya implicaba que podia haber no-vigentes -- pero el
-- unique no dejaba que existieran.
--
-- Mismo patron que calificaciones.vigente (migracion 023).

alter table transcripciones
  add column vigente boolean not null default true;

drop index transcripciones_llamada_unique;

create unique index transcripciones_llamada_vigente
  on transcripciones(llamada_id)
  where vigente;

comment on column transcripciones.vigente is
  'Al re-transcribir una llamada, la transcripcion anterior se marca
  vigente=false -- nunca se borra, para no perder la evidencia de contra
  que texto se evaluo. El pipeline de evaluacion (paso 3) siempre lee la
  transcripcion con vigente=true.';
