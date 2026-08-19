-- Migracion 027: registrar la version de plantilla usada por calificacion
--
-- Cierra H22 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- El calculo apunta al parametro VIVO (parametros_calidad, filtrado por
-- activo=true) sin congelar que version de la plantilla estaba vigente
-- cuando se hizo la calificacion. Si mas adelante se edita una pregunta
-- existente in situ (en vez de crear una version nueva de la plantilla),
-- el recalculo de una calificacion vieja cambiaria retroactivamente su
-- resultado sin que nadie lo pidiera.
--
-- Se agrega la columna, poblada desde plantillas_evaluacion.version al
-- crear la calificacion. No se agrega todavia un trigger que bloquee
-- editar parametros_calidad con calificaciones existentes -- el propio
-- informe lo deja condicionado a que el negocio confirme la regla
-- operativa (los parametros de una plantilla activa no se editan in situ,
-- se crea una version nueva). Mientras tanto, esta columna deja al menos
-- registrado el hecho, para poder auditarlo si hace falta.

alter table calificaciones
  add column plantilla_version integer;

comment on column calificaciones.plantilla_version is
  'plantillas_evaluacion.version vigente cuando se creo esta calificacion.
  Nullable en calificaciones historicas (esta columna no existia antes) --
  el pipeline debe poblarla siempre en inserciones nuevas. Regla operativa
  pendiente de confirmar con negocio: los parametros de una plantilla
  activa no deberian editarse in situ, sino crear una version nueva.';
