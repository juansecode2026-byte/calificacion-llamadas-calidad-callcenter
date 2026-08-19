-- Migracion 018: calificaciones.evaluador_id nullable, con origen
--
-- Cierra H9 de la auditoria (docs/revision-backend-db-2026-08-18.md).
--
-- calificaciones.evaluador_id es NOT NULL y referencia evaluadores, pero
-- CONTEXT.md es explicito: la calificacion la produce la IA, el evaluador
-- humano solo lee el resultado y lo reenvia -- no califica. El pipeline
-- automatico no tiene ningun evaluador real que poner ahi.
--
-- Se sigue el mismo patron que calificacion_detalle.origen (migracion 005,
-- ya existe): la columna sirve para los dos casos sin tener que inventar
-- un evaluador falso.

alter table calificaciones
  alter column evaluador_id drop not null,
  add column origen text not null default 'ia' check (origen in ('humano', 'ia')),
  add constraint calificaciones_evaluador_segun_origen check (
    origen = 'ia' or evaluador_id is not null
  );

comment on column calificaciones.origen is
  'humano/ia -- mismo patron que calificacion_detalle.origen (migracion
  005). El pipeline automatico inserta con origen=ia y evaluador_id null.';

comment on column calificaciones.evaluador_id is
  'Null cuando origen=ia (el caso normal del pipeline automatico). El
  check calificaciones_evaluador_segun_origen exige un evaluador real
  solo cuando origen=humano.';
