-- Migracion 023: calificaciones.vigente
--
-- Cierra H16 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- No habia unique ni nocion de "vigente" en calificaciones(llamada_id).
-- Reprocesar una llamada (ej: se corrigio la transcripcion y se vuelve a
-- evaluar) insertaria una segunda calificacion completa, duplicando cada
-- KPI del asesor en el dashboard.
--
-- El reproceso debe marcar la calificacion anterior vigente=false, nunca
-- borrarla (se pierde el historial de que existio una evaluacion previa).
-- Todas las consultas de KPI y el dashboard deben filtrar por vigente=true.

alter table calificaciones
  add column vigente boolean not null default true;

create unique index calificaciones_una_vigente_por_llamada
  on calificaciones(llamada_id)
  where vigente;

comment on column calificaciones.vigente is
  'Al reprocesar una llamada, la calificacion anterior se marca
  vigente=false -- nunca se borra. El indice
  calificaciones_una_vigente_por_llamada garantiza una sola vigente por
  llamada. Todo KPI y todo query del dashboard debe filtrar por
  vigente=true.';
